// Published full and scene GLBs must match their catalogs and remain decodable.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { sceneModelUrl } from '../../src/shared/assets/scene-models.js';
import { loadGLTF, modelBytes } from '../../src/shared/assets/gltf.js';

const root = new URL('../../public/', import.meta.url);
const catalogs = await Promise.all(['library/catalog.json', 'swamp/asset-manifest.json', 'cove/asset-manifest.json']
  .map(async path => JSON.parse(await readFile(new URL(`assets/${path}`, root), 'utf8'))));
const runtime = JSON.parse(await readFile(new URL('assets/runtime/asset-manifest.json', root), 'utf8'));
const checked = new Map();
let compressedViews = 0;
await MeshoptDecoder.ready;
for (const catalog of [...catalogs, runtime]) {
  for (const asset of catalog.assets.filter(asset => asset.path?.endsWith('.glb'))) {
    assert(asset.path.startsWith('/assets/') && !asset.path.includes('..'), 'Expected a public asset path');
    let file = checked.get(asset.path);
    if (!file) {
      const bytes = await readFile(new URL(asset.path.slice(1), root));
      assert.equal(bytes.readUInt32LE(0), 0x46546c67, asset.path);
      assert.equal(bytes.readUInt32LE(4), 2, `${asset.path}: expected glTF 2`);
      assert.equal(bytes.readUInt32LE(8), bytes.length, `${asset.path}: truncated GLB`);
      assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, `${asset.path}: missing JSON chunk`);
      const jsonEnd = 20 + bytes.readUInt32LE(12);
      const document = JSON.parse(bytes.subarray(20, jsonEnd));
      assert.equal(bytes.readUInt32LE(jsonEnd + 4), 0x004e4942, `${asset.path}: missing BIN chunk`);
      const binary = bytes.subarray(jsonEnd + 8);
      assert.equal(bytes.readUInt32LE(jsonEnd), binary.length, `${asset.path}: truncated BIN chunk`);
      for (const view of document.bufferViews ?? []) {
        const extension = view.extensions?.EXT_meshopt_compression;
        if (!extension) continue;
        assert.equal(extension.buffer, 0);
        assert.equal(view.byteLength, extension.count * extension.byteStride);
        const offset = extension.byteOffset ?? 0;
        assert(offset + extension.byteLength <= binary.length, 'Compressed data exceeds BIN');
        const decoded = new Uint8Array(view.byteLength);
        MeshoptDecoder.decodeGltfBuffer(decoded, extension.count, extension.byteStride,
          binary.subarray(offset, offset + extension.byteLength), extension.mode, extension.filter);
        compressedViews++;
      }
      file = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
      checked.set(asset.path, file);
    }
    assert.equal(asset.bytes, file.bytes, `${asset.path}: stale catalog bytes`);
    assert.equal(asset.sha256, file.sha256, `${asset.path}: stale catalog checksum`);
  }
}
const size = path => checked.get(`/assets/library/${path}/model.glb`).bytes;
const sum = assets => assets.reduce((total, asset) => total + (asset.bytes ?? 0), 0);
// These retained budgets describe full library/catalog files, not scene traffic.
const libraryBudgets = {
  arenaLibraryModels: [size('maverick-gt') + size('ocean-buoy'), 4_500_000],
  coveLibraryWithoutFoliage: [sum(catalogs[2].assets.filter(asset => asset.id !== 'jacaranda-tree')), 17_000_000],
  coveFullCatalog: [sum(catalogs[2].assets), 42_000_000],
  swampFullCatalog: [sum(catalogs[1].assets), 14_000_000],
};
for (const [name, [bytes, limit]] of Object.entries(libraryBudgets)) assert(bytes <= limit, `${name}: ${bytes} exceeds ${limit} bytes`);
assert.equal(catalogs[1].totalBytes, libraryBudgets.swampFullCatalog[0]);

const expectedVariants = [
  'maverick-gt', 'ocean-buoy', 'futuristic-speedboat', 'riva-aquarama',
  'modular-wooden-pier', 'rock-09', 'rock-face-01',
  'painted-wooden-bench', 'wooden-crate-02', 'lifebuoy',
];
const runtimeById = new Map(runtime.assets.map(asset => [asset.id, asset]));
assert.equal(runtimeById.size, runtime.assets.length, 'Duplicate runtime model IDs');
assert.deepEqual([...runtimeById.keys()].sort(), [...expectedVariants].sort(), 'Runtime catalog must cover every scene variant');
const base = 'https://fixtures.invalid/project/assets/';
let mappingChecks = 0;
for (const asset of runtime.assets) {
  assert.equal(asset.path, `/assets/runtime/${asset.id}.glb`);
  assert.equal(asset.sourcePath, `/assets/library/${asset.id}/model.glb`);
  assert(checked.has(asset.sourcePath), `${asset.id}: unknown full-library source`);
  assert(asset.bytes < checked.get(asset.sourcePath).bytes, `${asset.id}: runtime variant must be smaller than its source`);
  for (const prefix of ['', '/project', '/nested/project']) {
    const source = `https://fixtures.invalid${prefix}${asset.sourcePath}?v=2026-10-05&key=a%2Fb#part`;
    const expected = `https://fixtures.invalid${prefix}${asset.path}?v=2026-10-05&key=a%2Fb#part`;
    assert.equal(sceneModelUrl(source, base), expected, `${asset.id}: preserve prefix/query/fragment`);
    mappingChecks++;
  }
  assert.equal(sceneModelUrl(`library/${asset.id}/model.glb?v=1`, base),
    `https://fixtures.invalid/project${asset.path}?v=1`, `${asset.id}: relative scene path`);
  mappingChecks++;
}
for (const unchanged of [
  '/assets/library/jacaranda-tree/model.glb?v=1',
  '/assets/swamp/island-tree.glb',
  '/assets/runtime/riva-aquarama.glb?v=1',
  '/library/riva-aquarama/model.glb',
  '/assets/library/riva-aquarama/model.glb.bak',
]) {
  assert.equal(sceneModelUrl(unchanged, base), new URL(unchanged, base).href, `Unlisted URL changed: ${unchanged}`);
  mappingChecks++;
}

// Exercise the public loader's delivery selector without downloading or parsing.
// In particular, the default/full asset-library path must never be substituted.
const originalRead = modelBytes.read;
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const stopped = new Error('URL selection captured');
const selectedUrls = [];
try {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: base } });
  modelBytes.read = async url => { selectedUrls.push(url); throw stopped; };
  for (const [options, expectedPath] of [
    [undefined, 'library/riva-aquarama/model.glb'],
    [{ delivery: 'full' }, 'library/riva-aquarama/model.glb'],
    [{ delivery: 'scene' }, 'runtime/riva-aquarama.glb'],
  ]) {
    await assert.rejects(loadGLTF('library/riva-aquarama/model.glb?v=1#part', options), error => error === stopped);
    assert.equal(selectedUrls.at(-1), `${base}${expectedPath}?v=1#part`);
    mappingChecks++;
  }
} finally {
  modelBytes.read = originalRead;
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else delete globalThis.document;
}

assert.deepEqual(runtime.core, {
  arena: ['maverick-gt', 'ocean-buoy'],
  swamp: ['futuristic-speedboat'],
  cove: ['riva-aquarama', 'modular-wooden-pier', 'rock-09', 'rock-face-01'],
}, 'Core model lists must describe the actual initial scene composition');
const runtimeCoreBudgets = Object.fromEntries(Object.entries(runtime.core).map(([page, ids]) => {
  const bytes = ids.reduce((total, id) => {
    assert(runtimeById.has(id), `${page}: missing runtime core model ${id}`);
    return total + checked.get(runtimeById.get(id).path).bytes;
  }, 0);
  const limit = 1_500_000;
  assert(bytes <= limit, `${page} runtime core: ${bytes} exceeds ${limit} bytes`);
  return [page, [bytes, limit]];
}));
console.log(JSON.stringify({ models: checked.size, runtimeModels: runtimeById.size, compressedViews,
  mappingChecks, libraryBudgets, runtimeCoreBudgets }, null, 2));
