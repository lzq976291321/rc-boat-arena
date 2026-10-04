import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, get } from "node:http";
import { access, readFile } from "node:fs/promises";
import { apply } from "../../dsh-plugin/lib/index.js";

const prefix = "/rc-boat-arena";
let server, origin;

before(async () => {
  await Promise.all(["index.html", "swamp/index.html", "cove/index.html", "library/index.html"].map(page => access(new URL("../../dist/" + page, import.meta.url)))).catch(
    () => {
      throw new Error(
        "Missing built page; run pnpm build before this check.",
      );
    },
  );
  let route;
  apply({
    effect: (effect) => effect(),
    webServer: {
      register: (registration) => {
        route = registration;
      },
    },
  });
  assert.equal(route.kind, "prefix");
  assert.equal(route.path, prefix);
  server = createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      void route.handler(req, res);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

function request(path) {
  return new Promise((resolve, reject) => {
    const req = get(new URL(path, origin), { agent: false }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        }),
      );
    });
    req.setTimeout(5000, () =>
      req.destroy(new Error(`Request timed out: ${path}`)),
    );
    req.on("error", reject);
  });
}

function assertType(response, expected) {
  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"]?.split(";")[0], expected);
}

test("nested directory redirects to a slash without losing the query", async () => {
  const response = await request(`${prefix}/swamp?foo=1`);
  assert.equal(response.status, 308);
  assert.equal(response.headers.location, `${prefix}/swamp/?foo=1`);
  const followed = await request(response.headers.location);
  assertType(followed, "text/html");
  assert.match(followed.body.toString(), /<title>Moonwater\b/);
});

test("swamp page serves Moonwater HTML under the prefixed route", async () => {
  const response = await request(`${prefix}/swamp/`);
  assertType(response, "text/html");
  assert.match(response.body.toString(), /<title>Moonwater\b/);
});

for (const pageName of ["swamp", "cove", "library"]) test(`${pageName} script and stylesheet URLs retain the prefix and MIME types`, async () => {
  const pageUrl = `${prefix}/${pageName}/`;
  const page = await request(pageUrl);
  assertType(page, "text/html");
  const html = page.body.toString();
  const scripts = [
    ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
  ].map((match) => match[1]);
  const styles = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /\brel=["']stylesheet["']/i.test(tag))
    .map((tag) => tag.match(/\bhref=["']([^"']+)["']/i)?.[1]);
  assert.ok(scripts.length > 0, "built HTML must include a script");
  assert.ok(styles.length > 0, "built HTML must include a stylesheet");
  for (const [type, paths] of [
    ["text/javascript", scripts],
    ["text/css", styles],
  ]) {
    for (const path of paths) {
      assert.ok(
        path?.startsWith("../"),
        `expected relative built asset: ${path}`,
      );
      const target = new URL(path, new URL(pageUrl, origin));
      assert.ok(
        target.pathname.startsWith(`${prefix}/assets/`),
        `asset lost its route prefix: ${path}`,
      );
      const response = await request(target);
      assertType(response, type);
      assert.ok(response.body.length > 0);
      assert.doesNotMatch(response.body.toString(), /^\s*<!doctype html/i);
    }
  }
});

test("all four swamp models are served as binary GLTF assets", async () => {
  const manifest = await request(`${prefix}/assets/swamp/asset-manifest.json`);
  assertType(manifest, "application/json");
  const models = JSON.parse(manifest.body.toString()).assets.filter((asset) =>
    asset.path?.endsWith(".glb"),
  );
  assert.equal(
    models.length,
    4,
    "manifest must describe all four scene models",
  );
  assert.equal(
    new Set(models.map((asset) => asset.path)).size,
    4,
    "model paths must be distinct",
  );
  for (const { path: modelPath } of models) {
    assert.ok(
      /^\/assets\/(swamp|library)\//.test(modelPath),
      `unexpected model path: ${modelPath}`,
    );
    const response = await request(`${prefix}${modelPath}`);
    assertType(response, "model/gltf-binary");
    assert.ok(
      response.body.length >= 12,
      `${modelPath} must contain a GLB header`,
    );
    assert.equal(
      response.body.toString("ascii", 0, 4),
      "glTF",
      `${modelPath} must be a GLB rather than fallback HTML`,
    );
    assert.equal(response.body.readUInt32LE(4), 2);
    assert.equal(response.body.readUInt32LE(8), response.body.length);
  }
});

test("original root remains the RC Boat Arena page", async () => {
  const response = await request(`${prefix}/`);
  assertType(response, "text/html");
  assert.match(response.body.toString(), /<title>RC Boat Arena\b/);
  assert.doesNotMatch(response.body.toString(), /<title>Moonwater\b/);
});

for (const [pageName, title] of [["cove", /<title>Sunny Cove\b/], ["library", /<title>素材库/]]) {
  test(`${pageName} directory redirects preserve queries and serve its own page`, async () => {
    const redirect = await request(`${prefix}/${pageName}?foo=1`);
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.location, `${prefix}/${pageName}/?foo=1`);
    const page = await request(redirect.headers.location);
    assertType(page, "text/html");
    assert.match(page.body.toString(), title);
  });
}

test("both dynamic viewing assets resolve under the mounted library route", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../dist/.vite/manifest.json", import.meta.url), "utf8"));
  const adapter = manifest["src/library/scene-preview.js"];
  for (const scene of ["moonwater", "sunny-cove"]) {
    const key = `src/scene-assets/${scene}/index.js`;
    assert.ok(adapter.dynamicImports.includes(key), `${scene} must be lazy`);
    const path = manifest[key].file;
    const relative = "./" + path.split("/").at(-1);
    const url = new URL(relative, new URL(`${prefix}/${adapter.file}`, origin));
    assert.equal(url.pathname, `${prefix}/${path}`);
    const response = await request(url);
    assertType(response, "text/javascript");
    assert.doesNotMatch(response.body.toString(), /^\s*<!doctype html/i);
  }
});

test("Sunny Cove source records serve all nine runtime GLBs with provenance", async () => {
  const response = await request(`${prefix}/assets/cove/asset-manifest.json`);
  assertType(response, "application/json");
  const assets = JSON.parse(response.body.toString()).assets;
  assert.equal(assets.length, 9);
  assert.equal(new Set(assets.map(asset => asset.path)).size, 9);
  assert.ok(assets.some(asset => asset.path === "/assets/library/riva-aquarama/model.glb"));
  assert.ok(assets.some(asset => asset.path === "/assets/library/jacaranda-tree/model.glb"));
  assert.ok(assets.some(asset => asset.path === "/assets/library/shrub-04/model.glb"));
  for (const asset of assets) {
    assert.ok(asset.source && asset.author && asset.license && asset.licenseUrl, `${asset.id} lacks provenance`);
    assert.match(asset.path, /^\/assets\/(library|swamp)\/.*\.glb$/);
    const model = await request(`${prefix}${asset.path}`);
    assertType(model, "model/gltf-binary");
    assert.equal(model.body.toString("ascii", 0, 4), "glTF");
    assert.equal(model.body.readUInt32LE(4), 2);
    assert.equal(model.body.readUInt32LE(8), model.body.length);
  }
});

test("all four entry icons retain the project prefix and serve SVG", async () => {
  for (const pageName of ["", "swamp/", "cove/", "library/"]) {
    const pageUrl = `${prefix}/${pageName}`;
    const page = await request(pageUrl);
    const icon = [...page.body.toString().matchAll(/<link\b[^>]*>/gi)]
      .map(match => match[0]).find(tag => /\brel=["']icon["']/i.test(tag));
    const href = icon?.match(/\bhref=["']([^"']+)["']/i)?.[1];
    assert.ok(href, `${pageName || "root"} has no explicit icon`);
    const url = new URL(href, new URL(pageUrl, origin));
    assert.equal(url.pathname, `${prefix}/favicon.svg`);
    const response = await request(url);
    assertType(response, "image/svg+xml");
    assert.match(response.body.toString(), /^<svg\b/);
  }
});
