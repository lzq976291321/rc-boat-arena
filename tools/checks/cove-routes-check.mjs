import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { access, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { apply } from '../../dsh-plugin/lib/index.js';
import { sceneModelUrl } from '../../src/shared/assets/scene-models.js';
import { BOATS } from '../../src/scene-assets/sunny-cove/config/boats.js';

const prefix = '/rc-boat-arena';
const dist = new URL('../../dist/', import.meta.url);
let server, origin, coveManifest;
before(async () => {
  await Promise.all(['index.html', 'swamp/index.html', 'cove/index.html', 'library/index.html']
    .map(page => access(new URL(page, dist)))).catch(() => {
    throw new Error('Missing built page or compatibility redirect; run pnpm build before this check.');
  });
  let route;
  apply({ effect: effect => effect(), webServer: { register: registration => { route = registration; } } });
  assert.equal(route.kind, 'prefix'); assert.equal(route.path, prefix);
  server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) void route.handler(req, res);
    else { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  coveManifest = JSON.parse(await readFile(new URL('assets/cove/asset-manifest.json', dist), 'utf8'));
});
after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
function request(path) {
  return new Promise((resolve, reject) => {
    const req = get(new URL(path, origin), { agent: false }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk)); res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(5000, () => req.destroy(new Error(`Request timed out: ${path}`))); req.on('error', reject);
  });
}
function assertType(response, expected) {
  assert.equal(response.status, 200); assert.equal(response.headers['content-type']?.split(';')[0], expected);
}
function assertGLB(response, path) {
  assertType(response, 'model/gltf-binary');
  assert.ok(response.body.length >= 20, `${path}: truncated GLB`);
  assert.equal(response.body.toString('ascii', 0, 4), 'glTF', `${path}: HTML fallback is not a model`);
  assert.equal(response.body.readUInt32LE(4), 2);
  assert.equal(response.body.readUInt32LE(8), response.body.length);
}

test('root is Sunny Cove and the DSH mount preserves root queries', async () => {
  const redirect = await request(`${prefix}?boat=1`);
  assert.equal(redirect.status, 308); assert.equal(redirect.headers.location, `${prefix}/?boat=1`);
  const page = await request(`${prefix}/`); assertType(page, 'text/html');
  assert.match(page.body.toString(), /<title>[^<]*(?:Sunny Cove|晴湾)/i);
  assert.doesNotMatch(page.body.toString(), /src\/arena|src\/swamp|Moonwater/);
});

for (const alias of ['cove', 'swamp', 'library']) {
  test(`${alias} compatibility link returns to the same mounted root with query and fragment`, async () => {
    const redirect = await request(`${prefix}/${alias}?boat=1`);
    assert.equal(redirect.status, 308); assert.equal(redirect.headers.location, `${prefix}/${alias}/?boat=1`);
    const response = await request(redirect.headers.location); assertType(response, 'text/html');
    const html = response.body.toString();
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i, 'Compatibility page must not start a second application');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
    assert.ok(scripts.length, 'Static hosts need a redirect script');
    for (const mount of ['', prefix, '/nested/project']) {
      const from = new URL(`${origin}${mount}/${alias}/?boat=1&scene=a%2Fb#camera`);
      let destination;
      const location = { href: from.href, pathname: from.pathname, search: from.search, hash: from.hash,
        origin: from.origin, replace: value => { destination = new URL(String(value), from).href; } };
      const context = { URL, location, window: { location } };
      for (const script of scripts) runInNewContext(script, context, { timeout: 1000 });
      assert.equal(destination, `${origin}${mount}/?boat=1&scene=a%2Fb#camera`, 'Redirect lost a prefix or user selection');
    }
  });
}

test('root scripts, CSS and icon retain the project prefix and correct MIME types', async () => {
  const pageUrl = `${prefix}/`, page = await request(pageUrl), html = page.body.toString();
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]);
  const styles = links.filter(tag => /\brel=["']stylesheet["']/i.test(tag)).map(tag => tag.match(/\bhref=["']([^"']+)["']/i)?.[1]);
  assert.ok(scripts.length && styles.length, 'Root needs compiled JS and CSS');
  for (const [type, paths] of [['text/javascript', scripts], ['text/css', styles]]) for (const path of paths) {
    const target = new URL(path, new URL(pageUrl, origin));
    assert.ok(target.pathname.startsWith(`${prefix}/assets/`), `Asset lost route prefix: ${path}`);
    const response = await request(target); assertType(response, type);
    assert.ok(response.body.length); assert.doesNotMatch(response.body.toString(), /^\s*<!doctype html/i);
  }
  const icon = links.find(tag => /\brel=["']icon["']/i.test(tag))?.match(/\bhref=["']([^"']+)["']/i)?.[1];
  assert.ok(icon, 'Root has no explicit icon');
  const iconUrl = new URL(icon, new URL(pageUrl, origin));
  assert.equal(iconUrl.pathname, `${prefix}/favicon.svg`);
  const response = await request(iconUrl); assertType(response, 'image/svg+xml'); assert.match(response.body.toString(), /^<svg\b/);
});

test('published source records cover every configured boat and retain compatible original model URLs', async () => {
  const response = await request(`${prefix}/assets/cove/asset-manifest.json`); assertType(response, 'application/json');
  const assets = JSON.parse(response.body.toString()).assets;
  assert.equal(new Set(assets.map(asset => asset.path)).size, assets.length);
  assert.deepEqual(assets.filter(asset => asset.role === 'boat').map(asset => asset.id).sort(), BOATS.map(boat => boat.id).sort());
  for (const asset of assets) {
    assert.ok(asset.source && asset.author && asset.license && asset.licenseUrl, `${asset.id}: missing provenance`);
    assert.match(asset.path, /^\/assets\/library\/[^/]+\/model\.glb$/);
    const model = await request(`${prefix}${asset.path}`); assertGLB(model, asset.path);
    assert.equal(model.body.length, asset.bytes, `${asset.id}: stale published byte count`);
    assert.equal(createHash('sha256').update(model.body).digest('hex'), asset.sha256, `${asset.id}: stale published checksum`);
    const source = await request(`${prefix}${asset.path.replace(/model\.glb$/, 'SOURCES.md')}`);
    assertType(source, 'text/plain'); assert.ok(source.body.length, `${asset.id}: missing original source notes`);
  }
});

test('scene delivery mapping resolves only to published, checksummed Sunny Cove variants', async () => {
  const response = await request(`${prefix}/assets/runtime/asset-manifest.json`); assertType(response, 'application/json');
  const runtime = JSON.parse(response.body.toString());
  const activeIds = new Set(coveManifest.assets.map(asset => asset.id));
  for (const asset of runtime.assets) {
    assert.ok(activeIds.has(asset.id), `${asset.id}: unused runtime asset was published`);
    const model = await request(`${prefix}${asset.path}`); assertGLB(model, asset.path);
    assert.equal(model.body.length, asset.bytes);
    assert.equal(createHash('sha256').update(model.body).digest('hex'), asset.sha256);
  }
  const variants = new Map(runtime.assets.map(asset => [asset.id, asset]));
  for (const asset of coveManifest.assets) {
    const path = sceneModelUrl(`${origin}${prefix}${asset.path}`, `${origin}${prefix}/`);
    assert.equal(path, `${origin}${prefix}${variants.get(asset.id)?.path ?? asset.path}`);
  }
  const notes = await request(`${prefix}/assets/runtime/SOURCES.md`); assertType(notes, 'text/plain'); assert.ok(notes.body.length);
});

test('production resource whitelist excludes unused models and local library indexes', async () => {
  await assert.rejects(access(new URL('assets/library/catalog.json', dist)), { code: 'ENOENT' });
  await assert.rejects(access(new URL('assets/swamp/', dist)), { code: 'ENOENT' });
  const expected = new Set(coveManifest.assets.map(asset => asset.path.slice(1)));
  const runtime = JSON.parse(await readFile(new URL('assets/runtime/asset-manifest.json', dist), 'utf8'));
  for (const asset of runtime.assets) expected.add(asset.path.slice(1));
  async function models(directory, path = '') {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = path + entry.name;
      if (entry.isDirectory()) result.push(...await models(new URL(entry.name + '/', directory), relative + '/'));
      else if (entry.name.endsWith('.glb')) result.push(relative);
    }
    return result;
  }
  assert.deepEqual((await models(dist)).sort(), [...expected].sort(), 'Published GLBs must equal the active manifest whitelist');
});
