import test from 'node:test';
import assert from 'node:assert/strict';
import { createBinaryCache } from '../../src/shared/assets/binary-cache.js';
import { disposeObjects } from '../../src/shared/rendering/resources.js';
import { pixelRatio } from '../../src/shared/rendering/pixel-budget.js';
const response = (bytes = 4) => new Response(new Uint8Array(bytes), { headers: { 'content-length': String(bytes) } });

test('concurrent callers share bytes and cached reads do not fetch again', async () => {
  let requests = 0;
  const cache = createBinaryCache({ fetcher: async () => { requests++; return response(); } });
  const [a, b] = await Promise.all([cache.read('/a'), cache.read('/a')]);
  assert.equal(a, b); assert.equal(await cache.read('/a'), a); assert.equal(requests, 1);
});
test('LRU obeys bytes and entry budgets; oversized files are not retained', async () => {
  const calls = [];
  const cache = createBinaryCache({ maxBytes: 8, maxEntries: 2, fetcher: async url => { calls.push(url); return response(url === '/huge' ? 12 : 4); } });
  await cache.read('/a'); await cache.read('/b'); await cache.read('/a'); await cache.read('/c');
  assert.equal(cache.info().bytes, 8); await cache.read('/b');
  assert.equal(calls.filter(url => url === '/b').length, 2);
  await cache.read('/huge'); assert.equal(cache.info().entries, 2); assert.equal(cache.info().bytes, 8);
  cache.clear(); assert.equal(cache.info().bytes, 0);
});
test('a cancelled consumer cannot abort another consumer of the same request', async () => {
  let release, requestSignal;
  const cache = createBinaryCache({ fetcher: (_, { signal }) => { requestSignal = signal; return new Promise(resolve => { release = resolve; }); } });
  const controller = new AbortController();
  const a = cache.read('/a', { signal: controller.signal }), b = cache.read('/a');
  controller.abort(); await assert.rejects(a, { name: 'AbortError' });
  assert.equal(requestSignal.aborted, false); release(response()); assert.equal((await b).byteLength, 4);
});
test('last cancellation aborts network and permits immediate retry', async () => {
  let attempts = 0, firstSignal;
  const cache = createBinaryCache({ fetcher: (_, { signal }) => {
    if (++attempts > 1) return Promise.resolve(response());
    firstSignal = signal;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  } });
  const controller = new AbortController();
  const first = cache.read('/a', { signal: controller.signal }); controller.abort();
  await assert.rejects(first, { name: 'AbortError' }); assert.equal(firstSignal.aborted, true);
  assert.equal((await cache.read('/a')).byteLength, 4); assert.equal(attempts, 2);
});
test('failed responses are evicted and can be retried', async () => {
  let attempts = 0;
  const cache = createBinaryCache({ fetcher: async () => ++attempts === 1 ? new Response('', { status: 404 }) : response() });
  await assert.rejects(cache.read('/bad'), /404/); await cache.read('/bad'); assert.equal(attempts, 2);
});
test('already aborted signals perform no request, including cache hits', async () => {
  let calls = 0; const cache = createBinaryCache({ fetcher: async () => { calls++; return response(); } });
  await cache.read('/a');
  await assert.rejects(cache.read('/a', { signal: AbortSignal.abort() }), { name: 'AbortError' });
  await assert.rejects(cache.read('/b', { signal: AbortSignal.abort() }), { name: 'AbortError' });
  assert.equal(calls, 1);
});
test('shared geometries, materials, uniform textures and bitmap data are disposed once', () => {
  const counts = { geometry: 0, material: 0, texture: 0, image: 0 };
  const image = { close() { counts.image++; } };
  const texture = { isTexture: true, source: { data: image }, dispose() { counts.texture++; } };
  const geometry = { dispose() { counts.geometry++; } };
  const material = { map: texture, uniforms: { map: { value: texture } }, dispose() { counts.material++; } };
  const root = { traverse(fn) { fn({ geometry, material }); fn({ geometry, material: [material] }); } };
  disposeObjects([root, root]); assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1, image: 1 });
  disposeObjects(root, { textures: false }); assert.equal(counts.texture, 1); assert.equal(counts.image, 1);
});
test('pixel budgets cap high DPR and remain finite for a hidden container', () => {
  const ratio = pixelRatio(4000, 3000, { dpr: 3, maxPixels: 1200000 });
  assert.ok(4000 * 3000 * ratio * ratio <= 1200001);
  assert.equal(pixelRatio(100, 100, { dpr: 1 }), 1); assert.ok(Number.isFinite(pixelRatio(0, 0)));
});
