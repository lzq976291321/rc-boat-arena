#!/usr/bin/env node
/** Build the Cove's leaves + trunk delivery variant from the retained library.
 * Usage: node tools/assets/build-cove-foliage.mjs [candidate-directory]
 * Source topology and embedded JPEG bytes are preserved. Only the unused fine
 * branches are removed; bounded FLOAT compression uses the existing pipeline.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outputRoot = resolve(root, process.argv[2] ?? 'tools/local/cove-foliage');
assert(process.argv.length <= 3, 'Pass at most one candidate directory');
assert(!outputRoot.startsWith(join(root, 'public') + '/'), 'Review candidates before copying to public');
const source = join(root, 'public/assets/library/jacaranda-tree/model.glb');
const input = await readFile(source), sha256 = value => createHash('sha256').update(value).digest('hex');
assert.equal(input.readUInt32LE(0), 0x46546c67);
assert.equal(input.readUInt32LE(8), input.length);
const jsonLength = input.readUInt32LE(12), document = JSON.parse(input.subarray(20, 20 + jsonLength));
const binary = input.subarray(28 + jsonLength), extName = 'EXT_meshopt_compression';
assert(!document.animations?.length && !document.skins?.length, 'Static model required');
await MeshoptDecoder.ready;
const payloads = document.bufferViews.map(view => {
  const ext = view.extensions?.[extName];
  if (!ext) {
    assert.equal(view.buffer, 0);
    return binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  }
  // The library's first delivery pass was lossless. Do not repeatedly quantize.
  assert(!ext.filter || ext.filter === 'NONE', 'Use an unfiltered source model');
  const result = new Uint8Array(view.byteLength);
  MeshoptDecoder.decodeGltfBuffer(result, ext.count, ext.byteStride,
    binary.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength), ext.mode, ext.filter);
  return Buffer.from(result);
});
const original = structuredClone(document), retainedMaterials = new Set(['jacaranda_tree_leaves', 'jacaranda_tree_trunk']);
for (const node of document.nodes) {
  if (node.mesh === undefined) continue;
  const materials = document.meshes[node.mesh].primitives.map(p => document.materials[p.material].name);
  if (!materials.every(name => retainedMaterials.has(name))) delete node.mesh;
}
function prune(key, references) {
  const selected = [...new Set(references.map(([owner, field]) => owner[field]))].sort((a, b) => a - b);
  const mapping = new Map(selected.map((id, index) => [id, index]));
  const before = document[key];
  document[key] = selected.map(id => before[id]);
  for (const [owner, field] of references) owner[field] = mapping.get(owner[field]);
  return selected;
}
prune('meshes', document.nodes.filter(n => n.mesh !== undefined).map(n => [n, 'mesh']));
const primitives = document.meshes.flatMap(mesh => mesh.primitives);
prune('materials', primitives.map(p => [p, 'material']));
const textureReferences = [];
function findTextureReferences(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (key.endsWith('Texture') && nested?.index !== undefined) textureReferences.push([nested, 'index']);
    findTextureReferences(nested);
  }
}
findTextureReferences(document.materials);
prune('textures', textureReferences);
prune('images', document.textures.map(texture => [texture, 'source']));
prune('samplers', document.textures.filter(texture => texture.sampler !== undefined).map(texture => [texture, 'sampler']));
const selectedAccessors = prune('accessors', primitives.flatMap(primitive => {
  assert.equal(primitive.mode ?? 4, 4); assert(!primitive.targets);
  return [[primitive, 'indices'], ...Object.keys(primitive.attributes).map(key => [primitive.attributes, key])];
}));
const selectedViews = prune('bufferViews', [...document.accessors, ...document.images].map(item => {
  assert(item.bufferView !== undefined && !item.sparse && !item.uri);
  return [item, 'bufferView'];
}));
let cursor = 0;
const chunks = [];
for (let i = 0; i < document.bufferViews.length; i++) {
  const view = document.bufferViews[i], data = payloads[selectedViews[i]];
  const offset = Math.ceil(cursor / 4) * 4;
  chunks.push(Buffer.alloc(offset - cursor), data);
  Object.assign(view, { buffer: 0, byteOffset: offset, byteLength: data.length });
  delete view.extensions; cursor = offset + data.length;
}
document.buffers = [{ byteLength: cursor }];
for (const field of ['extensionsUsed', 'extensionsRequired']) {
  document[field] = (document[field] ?? []).filter(ext => ext !== extName);
  if (!document[field].length) delete document[field];
}
const json = Buffer.from(JSON.stringify(document)), paddedJson = Math.ceil(json.length / 4) * 4;
const packed = Buffer.alloc(28 + paddedJson + Math.ceil(cursor / 4) * 4);
packed.writeUInt32LE(0x46546c67); packed.writeUInt32LE(2, 4); packed.writeUInt32LE(packed.length, 8);
packed.writeUInt32LE(paddedJson, 12); packed.writeUInt32LE(0x4e4f534a, 16);
packed.fill(32, 20, 20 + paddedJson); json.copy(packed, 20);
packed.writeUInt32LE(Math.ceil(cursor / 4) * 4, 20 + paddedJson); packed.writeUInt32LE(0x004e4942, 24 + paddedJson);
Buffer.concat(chunks).copy(packed, 28 + paddedJson);
// Check the prepared file against decoded source payloads, including every JPEG.
const preparedBinary = packed.subarray(28 + paddedJson);
for (let i = 0; i < document.bufferViews.length; i++) {
  const view = document.bufferViews[i];
  assert(preparedBinary.subarray(view.byteOffset, view.byteOffset + view.byteLength).equals(payloads[selectedViews[i]]));
}
for (let i = 0; i < selectedAccessors.length; i++) {
  const before = { ...original.accessors[selectedAccessors[i]] }, after = { ...document.accessors[i] };
  delete before.bufferView; delete after.bufferView; assert.deepEqual(after, before);
}
assert.deepEqual(document.materials.map(m => m.name).sort(), [...retainedMaterials].sort());
const triangles = primitives.reduce((sum, p) => sum + document.accessors[p.indices].count / 3, 0);
assert.equal(triangles, 334314, 'Keep every original leaf and trunk triangle');
await mkdir(outputRoot, { recursive: true });
const prepared = join(outputRoot, 'prepared.glb'), output = join(outputRoot, 'jacaranda-tree.glb');
const geometryReport = join(outputRoot, 'geometry.json');
try {
  await writeFile(prepared, packed);
  const result = spawnSync(process.execPath, [join(root, 'tools/assets/bound-startup-glb.mjs'), prepared, output, '--report', geometryReport],
    { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
} finally { await rm(prepared, { force: true }); }
const geometry = JSON.parse(await readFile(geometryReport));
assert.equal(sha256(await readFile(source)), sha256(input), 'Original library must remain untouched');
const report = {
  source: 'public/assets/library/jacaranda-tree/model.glb', sourceBytes: input.length, sourceSha256: sha256(input),
  output: 'public/assets/runtime/jacaranda-tree.glb', bytes: geometry.outputBytes, sha256: geometry.outputSha256,
  selectedNodes: document.nodes.filter(n => n.mesh !== undefined).map(n => n.name), triangles,
  removedTriangles: 123128, retainedImageBytes: document.images.reduce((sum, image) => sum + document.bufferViews[image.bufferView].byteLength, 0),
  verification: { sourceUntouched: true, selectedAccessorsExactBeforeFiltering: true, retainedImageBytesExact: true,
    noSimplification: true, fineBranchesPreviouslyUnused: true, ...geometry.verification },
  bounds: geometry.bounds, attributes: geometry.attributes,
};
await writeFile(join(outputRoot, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ sourceBytes: input.length, bytes: report.bytes, triangles, report: join(outputRoot, 'report.json') }));
