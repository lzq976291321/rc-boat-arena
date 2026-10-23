// Only current Sunny Cove source models and delivery variants belong in the project.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { sceneModelUrl } from '../../src/shared/assets/scene-models.js';
import { loadGLTF, modelBytes } from '../../src/shared/assets/gltf.js';
import { BOATS, DEFAULT_BOAT_ID } from '../../src/scene-assets/sunny-cove/config/boats.js';

const root = new URL('../../public/', import.meta.url);
const catalogs = await Promise.all(['library/catalog.json', 'cove/asset-manifest.json']
  .map(async path => JSON.parse(await readFile(new URL(`assets/${path}`, root), 'utf8'))));
const runtime = JSON.parse(await readFile(new URL('assets/runtime/asset-manifest.json', root), 'utf8'));
const checked = new Map();
const documents = new Map();
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
      checked.set(asset.path, file); documents.set(asset.path, document);
    }
    assert.equal(asset.bytes, file.bytes, `${asset.path}: stale catalog bytes`);
    assert.equal(asset.sha256, file.sha256, `${asset.path}: stale catalog checksum`);
  }
}
// Delivered variants must declare the vendor image format they actually use,
// and may not keep vertex attributes no material can read.
const cove = catalogs[1];
const textureFormats = new Set();
let runtimeImageBytes = 0;
for (const asset of runtime.assets) {
  const document = documents.get(asset.path);
  assert(document, `${asset.id}: runtime document was not parsed`);
  const textures = document.textures ?? [];
  const images = document.images ?? [];
  for (const texture of textures) {
    const source = texture.source ?? Object.values(texture.extensions ?? {})[0]?.source;
    const mime = images[source]?.mimeType;
    assert(['image/avif', 'image/webp', 'image/jpeg', 'image/png'].includes(mime),
      `${asset.id}: unsupported image type ${mime}`);
    textureFormats.add(mime.replace('image/', ''));
    if (mime === 'image/avif') assert(texture.extensions?.EXT_texture_avif?.source === source,
      `${asset.id}: AVIF texture is missing EXT_texture_avif`);
    if (mime === 'image/webp') assert(texture.extensions?.EXT_texture_webp?.source === source,
      `${asset.id}: WebP texture is missing EXT_texture_webp`);
    if (mime === 'image/avif') assert(document.extensionsUsed?.includes('EXT_texture_avif'),
      `${asset.id}: extensionsUsed omits EXT_texture_avif`);
    if (mime === 'image/webp') assert(document.extensionsUsed?.includes('EXT_texture_webp'),
      `${asset.id}: extensionsUsed omits EXT_texture_webp`);
  }
  runtimeImageBytes += images.reduce((total, image) =>
    total + (document.bufferViews[image.bufferView]?.byteLength ?? 0), 0);
  const actualFormats = [...new Set(images.map(image => image.mimeType.replace('image/', '')))].sort();
  assert.deepEqual([...new Set(asset.textureFormats ?? [])].sort(), actualFormats,
    `${asset.id}: manifest texture formats are stale`);
  let triangles = 0;
  for (const mesh of document.meshes ?? []) for (const primitive of mesh.primitives) {
    triangles += primitive.indices === undefined
      ? document.accessors[primitive.attributes.POSITION].count / 3
      : document.accessors[primitive.indices].count / 3;
  }
  assert.equal(asset.triangles, triangles, `${asset.id}: manifest triangle count is stale`);
  const usedTexcoords = new Set();
  const visit = (value, key = '') => {
    if (Array.isArray(value)) { for (const item of value) visit(item, key); return; }
    if (!value || typeof value !== 'object') return;
    if (key.endsWith('Texture') && 'index' in value) usedTexcoords.add(value.texCoord ?? 0);
    for (const [child, item] of Object.entries(value)) visit(item, child);
  };
  visit(document.materials ?? []);
  for (const mesh of document.meshes ?? []) for (const primitive of mesh.primitives) {
    for (const name of Object.keys(primitive.attributes)) {
      if (name === 'TANGENT') assert.fail(`${asset.id}: authored tangents must be removed`);
      const match = /^TEXCOORD_(\d+)$/.exec(name);
      if (match) assert(usedTexcoords.has(Number(match[1])),
        `${asset.id}: ${name} is not referenced by any material`);
    }
  }
}
const coveById = new Map(cove.assets.map(asset => [asset.id, asset]));
const library = catalogs[0];
assert(library.assets.every(asset => asset.kind === 'model'), 'Local catalog must contain only active models');
assert.deepEqual(library.assets.map(asset => asset.path).sort(), cove.assets.map(asset => asset.path).sort(),
  'Local library and Cove must cover the same source models');
for (const source of cove.assets) {
  const entry = library.assets.find(asset => asset.path === source.path);
  assert.equal(entry.id, `builtin-${source.id}`, `${source.id}: local annotation ID changed`);
  assert.equal(entry.stage, 'integrated', `${source.id}: inactive catalog record`);
  for (const key of ['author', 'license', 'source', 'licenseUrl', 'bytes', 'sha256']) {
    assert.equal(entry[key], source[key], `${source.id}: source and local catalog disagree on ${key}`);
  }
  const files = await readdir(new URL(`assets/library/${source.id}/`, root));
  assert.deepEqual(files.sort(), ['SOURCES.md', 'model.glb'], `${source.id}: unexpected library files`);
}
const libraryDirectories = (await readdir(new URL('assets/library/', root), { withFileTypes: true }))
  .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
assert.deepEqual(libraryDirectories, cove.assets.map(asset => asset.id).sort(), 'Unused model directories remain');
assert.equal(coveById.size, cove.assets.length, 'Duplicate Cove source IDs');
assert.equal(new Set(cove.assets.map(asset => asset.path)).size, cove.assets.length, 'Duplicate Cove source paths');
assert.deepEqual(cove.assets.filter(asset => asset.role === 'boat').map(asset => asset.id).sort(),
  BOATS.map(boat => boat.id).sort(), 'Source records must cover exactly the configured boats');
for (const boat of BOATS) {
  assert.equal(coveById.get(boat.id)?.path, `/assets/${boat.path}`, `${boat.id}: source path differs from boat configuration`);
}
const runtimeById = new Map(runtime.assets.map(asset => [asset.id, asset]));
assert.equal(runtimeById.size, runtime.assets.length, 'Duplicate runtime model IDs');
assert.deepEqual([...runtimeById.keys()].sort(), [...coveById.keys()].sort(), 'Unused or missing runtime variants');
// Every retained model has an active production mapping contract.
const activeVariants = runtime.assets.filter(asset => coveById.has(asset.id));
const base = 'https://fixtures.invalid/project/assets/';
let mappingChecks = 0;
for (const asset of activeVariants) {
  assert.equal(asset.path, `/assets/runtime/${asset.id}.glb`);
  assert.equal(asset.sourcePath, coveById.get(asset.id).path);
  assert(checked.has(asset.sourcePath), `${asset.id}: unknown full-library source`);
  assert(asset.bytes < checked.get(asset.sourcePath).bytes, `${asset.id}: runtime variant must be smaller than its source`);
  for (const prefix of ['', '/project', '/nested/project']) {
    const source = `https://fixtures.invalid${prefix}${asset.sourcePath}?v=1&key=a%2Fb#part`;
    const expected = `https://fixtures.invalid${prefix}${asset.path}?v=1&key=a%2Fb#part`;
    assert.equal(sceneModelUrl(source, base), expected, `${asset.id}: preserve prefix/query/fragment`);
    mappingChecks++;
  }
  assert.equal(sceneModelUrl(asset.sourcePath.slice('/assets/'.length) + '?v=1', base),
    `https://fixtures.invalid/project${asset.path}?v=1`, `${asset.id}: relative scene path`);
  mappingChecks++;
}
for (const asset of cove.assets) {
  const expected = runtimeById.get(asset.id)?.path ?? asset.path;
  assert.equal(sceneModelUrl(asset.path, base), `https://fixtures.invalid${expected}`,
    `${asset.id}: active source must select its declared runtime variant`);
  mappingChecks++;
}
for (const unchanged of [
  '/assets/library/unlisted-fixture/model.glb?v=1',
  '/assets/runtime/riva-aquarama.glb?v=1',
  '/library/riva-aquarama/model.glb',
  '/assets/library/riva-aquarama/model.glb.bak',
]) {
  assert.equal(sceneModelUrl(unchanged, base), new URL(unchanged, base).href, `Unlisted URL changed: ${unchanged}`);
  mappingChecks++;
}

// Exercise the public loader's delivery selector without downloading or parsing.
// The default/full asset-workbench path must never be substituted.
const originalRead = modelBytes.read;
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const stopped = new Error('URL selection captured');
const selectedUrls = [];
const defaultBoat = BOATS.find(boat => boat.id === DEFAULT_BOAT_ID);
assert(defaultBoat, 'Default boat must be configured');
const defaultRuntime = runtimeById.get(DEFAULT_BOAT_ID);
assert(defaultRuntime, 'Default boat needs a runtime delivery variant');
try {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: base } });
  modelBytes.read = async url => { selectedUrls.push(url); throw stopped; };
  for (const [options, expectedPath] of [
    [undefined, defaultBoat.path],
    [{ delivery: 'full' }, defaultBoat.path],
    [{ delivery: 'scene' }, defaultRuntime.path.slice('/assets/'.length)],
  ]) {
    await assert.rejects(loadGLTF(`${defaultBoat.path}?v=1#part`, options), error => error === stopped);
    assert.equal(selectedUrls.at(-1), `${base}${expectedPath}?v=1#part`);
    mappingChecks++;
  }
} finally {
  modelBytes.read = originalRead;
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else delete globalThis.document;
}

const core = runtime.core?.cove;
assert(Array.isArray(core) && core.includes(DEFAULT_BOAT_ID), 'Cove core must name its default boat');
assert.equal(new Set(core).size, core.length, 'Duplicate startup model IDs');
for (const id of core) {
  assert(coveById.has(id), `${id}: startup model is absent from the Cove source manifest`);
  assert(id === DEFAULT_BOAT_ID || coveById.get(id).role !== 'boat', 'Only the selected boat may load on startup');
}
const deliveredSize = id => {
  const asset = runtimeById.get(id) ?? coveById.get(id);
  assert(asset && checked.has(asset.path), `${id}: unverified scene model`);
  return checked.get(asset.path).bytes;
};
const sceneryBytes = cove.assets.filter(asset => asset.role !== 'boat')
  .reduce((total, asset) => total + deliveredSize(asset.id), 0);
const boatBudgets = {};
for (const boat of BOATS) {
  const coreBytes = core.reduce((total, id) => total + deliveredSize(id === DEFAULT_BOAT_ID ? boat.id : id), 0);
  const coreLimit = boat.id === DEFAULT_BOAT_ID ? 1_500_000 : 2_000_000;
  const fullSceneBytes = sceneryBytes + deliveredSize(boat.id);
  assert(coreBytes <= coreLimit, `${boat.id} startup ${coreBytes} exceeds ${coreLimit} bytes`);
  assert(fullSceneBytes <= 8_000_000, `${boat.id} selected scene ${fullSceneBytes} exceeds 8 MB`);
  boatBudgets[boat.id] = { coreBytes, coreLimit, fullSceneBytes, sceneLimit: 8_000_000 };
}
console.log(JSON.stringify({ models: checked.size, activeRuntimeModels: activeVariants.length,
  compressedViews, mappingChecks, textureFormats: [...textureFormats].sort(), runtimeImageBytes,
  sceneryBytes, boatBudgets }, null, 2));
