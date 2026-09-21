import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, get } from "node:http";
import { access } from "node:fs/promises";
import { apply } from "../../dsh-plugin/lib/index.js";

const prefix = "/rc-boat-arena";
let server, origin;

before(async () => {
  await access(new URL("../../dist/swamp/index.html", import.meta.url)).catch(
    () => {
      throw new Error(
        "Missing built swamp page; run pnpm build before this check.",
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

test("relative script and stylesheet URLs resolve to served assets with correct MIME types", async () => {
  const pageUrl = `${prefix}/swamp/`;
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
