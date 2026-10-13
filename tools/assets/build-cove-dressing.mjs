#!/usr/bin/env node
/** Reviewable Cove detail variants. Full library files are never overwritten.
 * node tools/assets/build-cove-dressing.mjs --python /path/to/python-with-pillow
 *   [--output-root tools/local/cove-dressing]
 *   [--only jacaranda-tree,shrub-04] [--tree-ratio .2] [--tree-error .006]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptSimplifier } from 'meshoptimizer';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const options = { '--python': 'python3', '--output-root': 'tools/local/cove-dressing', '--tree-ratio': '.2', '--tree-error': '.006', '--only': '' };
const args = process.argv.slice(2);
assert.equal(args.length % 2, 0, 'Every option needs a value');
for (let i = 0; i < args.length; i += 2) { assert(args[i] in options); options[args[i]] = args[i + 1]; }
assert(Number(options['--tree-ratio']) > 0 && Number(options['--tree-ratio']) <= 1, 'Tree ratio must be in (0, 1]');
assert(Number(options['--tree-error']) > 0 && Number(options['--tree-error']) <= .01, 'Tree error must be in (0, .01]');
const outputRoot = resolve(root, options['--output-root']);
assert(!outputRoot.startsWith(join(root, 'public') + '/'), 'Review before copying to public');
const EXT = 'EXT_meshopt_compression', sha = b => createHash('sha256').update(b).digest('hex');
await Promise.all([MeshoptDecoder.ready, MeshoptSimplifier.ready]);
function unpack(bytes) {
  const n = bytes.readUInt32LE(12), doc = JSON.parse(bytes.subarray(20, 20 + n)), bin = bytes.subarray(28 + n);
  const payloads = doc.bufferViews.map(view => {
    const ext = view.extensions?.[EXT];
    if (!ext) return Buffer.from(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
    const result = new Uint8Array(view.byteLength);
    MeshoptDecoder.decodeGltfBuffer(result, ext.count, ext.byteStride,
      bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength), ext.mode, ext.filter);
    delete view.extensions;
    return Buffer.from(result);
  });
  for (const field of ['extensionsUsed', 'extensionsRequired']) {
    doc[field] = (doc[field] ?? []).filter(name => name !== EXT);
    if (!doc[field].length) delete doc[field];
  }
  return { doc, payloads };
}
function pack(doc, payloads) {
  let size = 0; const chunks = [];
  payloads.forEach((payload, i) => {
    const offset = Math.ceil(size / 4) * 4; chunks.push(Buffer.alloc(offset - size), payload);
    Object.assign(doc.bufferViews[i], { buffer: 0, byteOffset: offset, byteLength: payload.length }); size = offset + payload.length;
  });
  doc.buffers = [{ byteLength: size }];
  const json = Buffer.from(JSON.stringify(doc)), n = Math.ceil(json.length / 4) * 4, b = Math.ceil(size / 4) * 4;
  const result = Buffer.alloc(28 + n + b);
  result.writeUInt32LE(0x46546c67); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(n, 12); result.writeUInt32LE(0x4e4f534a, 16); result.fill(32, 20, 20 + n); json.copy(result, 20);
  result.writeUInt32LE(b, 20 + n); result.writeUInt32LE(0x004e4942, 24 + n); Buffer.concat(chunks).copy(result, 28 + n);
  return result;
}
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }, constructors = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
function accessorArray(doc, payloads, id) {
  const a = doc.accessors[id], Ctor = constructors[a.componentType], components = widths[a.type], bytes = Ctor.BYTES_PER_ELEMENT;
  assert(Ctor && components && !a.sparse);
  const view = doc.bufferViews[a.bufferView], stride = view.byteStride ?? bytes * components;
  const data = payloads[a.bufferView], result = new Ctor(a.count * components);
  const target = Buffer.from(result.buffer);
  for (let i = 0; i < a.count; i++) data.copy(target, i * components * bytes, (a.byteOffset ?? 0) + i * stride, (a.byteOffset ?? 0) + i * stride + components * bytes);
  return result;
}
function setAccessor(doc, payloads, id, values) {
  const a = doc.accessors[id], components = widths[a.type];
  a.bufferView = doc.bufferViews.length; a.count = values.length / components; delete a.byteOffset;
  doc.bufferViews.push({ buffer: 0, byteLength: values.byteLength }); payloads.push(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
  if (a.min || a.max) {
    a.min = Array(components).fill(Infinity); a.max = Array(components).fill(-Infinity);
    values.forEach((value, index) => { const c = index % components; a.min[c] = Math.min(a.min[c], value); a.max[c] = Math.max(a.max[c], value); });
  }
}
function simplifyTree(doc, payloads) {
  const report = [];
  for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
    const positions = accessorArray(doc, payloads, primitive.attributes.POSITION);
    const indices = Uint32Array.from(accessorArray(doc, payloads, primitive.indices));
    const normal = accessorArray(doc, payloads, primitive.attributes.NORMAL);
    const uv = accessorArray(doc, payloads, primitive.attributes.TEXCOORD_0);
    const attributes = new Float32Array(positions.length / 3 * 5);
    for (let i = 0; i < positions.length / 3; i++) attributes.set([...normal.subarray(i * 3, i * 3 + 3), ...uv.subarray(i * 2, i * 2 + 2)], i * 5);
    const name = doc.materials[primitive.material].name, ratio = name.includes('leaves') ? Number(options['--tree-ratio']) : .32;
    const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attributes, 5,
      [.015, .015, .015, .05, .05], null, Math.floor(indices.length * ratio / 3) * 3, Number(options['--tree-error']));
    const originalIndices = simplified.slice(), [remap, vertexCount] = MeshoptSimplifier.compactMesh(simplified);
    for (let index = 0; index < simplified.length; index++) assert.equal(simplified[index], remap[originalIndices[index]], 'Compaction must preserve every selected corner');
    for (const id of Object.values(primitive.attributes)) {
      const values = accessorArray(doc, payloads, id), Ctor = values.constructor, components = widths[doc.accessors[id].type];
      const packed = new Ctor(vertexCount * components);
      for (let old = 0; old < remap.length; old++) if (remap[old] !== 0xffffffff)
        packed.set(values.subarray(old * components, old * components + components), remap[old] * components);
      setAccessor(doc, payloads, id, packed);
    }
    doc.accessors[primitive.indices].componentType = 5125;
    setAccessor(doc, payloads, primitive.indices, simplified);
    report.push({ material: name, originalTriangles: indices.length / 3, triangles: simplified.length / 3,
      vertices: vertexCount, requestedRatio: ratio, measuredRelativeError: error,
      sourcePositionScale: MeshoptSimplifier.getScale(positions, 3), retainedVertexAttributesExactBeforeCompression: true,
      wholeComponentsPruned: false, selectedOriginalIndicesSha256: sha(Buffer.from(originalIndices.buffer)) });
  }
  // Accessors now own new compact payloads. Remove superseded raw buffer views.
  const refs = [...doc.accessors, ...doc.images];
  const selected = [...new Set(refs.map(item => item.bufferView))].sort((a, b) => a - b);
  const mapping = new Map(selected.map((id, i) => [id, i]));
  doc.bufferViews = selected.map(id => doc.bufferViews[id]);
  const compactPayloads = selected.map(id => payloads[id]);
  refs.forEach(item => { item.bufferView = mapping.get(item.bufferView); });
  return { report, payloads: compactPayloads };
}
const models = [
  { id: 'old-tyre', textureSize: 256 },
  { id: 'wooden-bucket-01', textureSize: 256 },
  { id: 'lantern-01', textureSize: 256 },
  { id: 'shrub-03', textureSize: 256, nodes: ['shrub_03_a'] },
  { id: 'shrub-sorrel-01', textureSize: 256, nodes: ['shrub_sorrel_01_d'] },
  { id: 'shrub-04', textureSize: 512 },
  { id: 'jacaranda-tree', textureSize: 512, nodes: ['jacaranda_tree_LOD0', 'jacaranda_tree_LOD0.002'], simplify: true },
];
const run = (executable, args) => {
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
};
await mkdir(outputRoot, { recursive: true });
const selectedModels = options['--only'] ? models.filter(model => options['--only'].split(',').includes(model.id)) : models;
for (const model of selectedModels) {
  const source = join(root, `public/assets/library/${model.id}/model.glb`), input = await readFile(source);
  const out = join(outputRoot, model.id); await mkdir(out, { recursive: true });
  const decoded = join(out, 'decoded.glb'), prepared = join(out, 'prepared.glb'), simplified = join(out, 'simplified.glb');
  const output = join(outputRoot, `${model.id}.glb`), texturesReport = join(out, 'textures.json'), geometryReport = join(out, 'geometry.json');
  const { doc, payloads } = unpack(input);
  try {
    await writeFile(decoded, pack(doc, payloads));
    run(options['--python'], [join(root, 'tools/assets/prepare-startup-glb.py'), decoded, prepared,
      '--report', texturesReport, '--max-texture-size', String(model.textureSize), ...(model.nodes ?? []).flatMap(node => ['--node', node])]);
    let compressionSource = prepared;
    if (model.simplify) {
      const preparedData = unpack(await readFile(prepared));
      const result = simplifyTree(preparedData.doc, preparedData.payloads); model.simplification = result.report;
      await writeFile(simplified, pack(preparedData.doc, result.payloads)); compressionSource = simplified;
    }
    run(process.execPath, [join(root, 'tools/assets/bound-startup-glb.mjs'), compressionSource, output, '--report', geometryReport]);
    const geometry = JSON.parse(await readFile(geometryReport));
    Object.assign(model, { source: `public/assets/library/${model.id}/model.glb`, sourceBytes: input.length, sourceSha256: sha(input),
      path: `/assets/runtime/${model.id}.glb`, bytes: geometry.outputBytes, sha256: geometry.outputSha256,
      triangles: geometry.triangles, nodes: geometry.nodes, verification: geometry.verification, attributes: geometry.attributes,
      geometryBounds: geometry.bounds, textures: JSON.parse(await readFile(texturesReport)).images });
    assert.equal(sha(await readFile(source)), sha(input), 'Library original must not change');
    console.log(JSON.stringify({ id: model.id, bytes: model.bytes, triangles: model.triangles, simplification: model.simplification }));
  } finally { for (const temporary of [decoded, prepared, simplified]) await rm(temporary, { force: true }); }
}
await writeFile(join(outputRoot, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), originalLibraryUntouched: true, models: selectedModels }, null, 2) + '\n');
