#!/usr/bin/env node
/**
 * Compress a prepared startup GLB with checked FLOAT precision bounds.
 * No topology changes or KHR_mesh_quantization. Triangle index encoding may
 * cyclically rotate a triangle's first vertex; vertices, order and winding are
 * checked per triangle. FLOAT values use explicit absolute error bounds. All
 * values are decoded through the pinned runtime decoder and min/max recomputed.
 * Usage: node bound-startup-glb.mjs input.glb output.glb --report report.json
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { MeshoptEncoder } from 'meshoptimizer';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const EXT = 'EXT_meshopt_compression';
const sizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const widths = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const bounds = { POSITION: 0.0002, NORMAL: 0.001, TANGENT: 0.001, TEXCOORD_0: 1 / 4096, TEXCOORD_1: 1 / 4096 };
const filterParameters = { minimumBits: 12, maximumBits: 24, exponentModes: ['Separate', 'SharedVector', 'SharedComponent'] };
const align4 = n => Math.ceil(n / 4) * 4;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function unpack(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const n = bytes.readUInt32LE(12), doc = JSON.parse(bytes.subarray(20, 20 + n));
  assert.equal(bytes.readUInt32LE(24 + n), 0x004e4942);
  assert.equal(bytes.readUInt32LE(20 + n) + 28 + n, bytes.length);
  return { doc, bin: bytes.subarray(28 + n) };
}
function pack(doc, bin) {
  const json = Buffer.from(JSON.stringify(doc)), n = align4(json.length), b = align4(bin.length);
  const out = Buffer.alloc(28 + n + b);
  out.writeUInt32LE(0x46546c67); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(n, 12); out.writeUInt32LE(0x4e4f534a, 16);
  out.fill(32, 20, 20 + n); json.copy(out, 20);
  out.writeUInt32LE(b, 20 + n); out.writeUInt32LE(0x004e4942, 24 + n); bin.copy(out, 28 + n);
  return out;
}
function bytesOf(bin, view) { return bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength); }
function decode(encoded, count, stride, mode, filter) {
  const out = new Uint8Array(count * stride);
  MeshoptDecoder.decodeGltfBuffer(out, count, stride, encoded, mode, filter);
  return out;
}
function difference(a, b) {
  let max = 0, square = 0;
  for (let i = 0; i < a.length; i++) {
    assert(Number.isFinite(a[i]) && Number.isFinite(b[i]), 'Non-finite FLOAT');
    const delta = Math.abs(a[i] - b[i]); max = Math.max(max, delta); square += delta * delta;
  }
  return { maxError: max, rmsError: Math.sqrt(square / a.length) };
}
function extrema(values, components) {
  const min = Array(components).fill(Infinity), max = Array(components).fill(-Infinity);
  for (let i = 0; i < values.length; i++) { const c = i % components; min[c] = Math.min(min[c], values[i]); max[c] = Math.max(max[c], values[i]); }
  return { min, max, dimensions: max.map((v, i) => v - min[i]) };
}
const [sourcePath, outputPath, flag, reportPath, ...extra] = process.argv.slice(2);
assert(sourcePath && outputPath && flag === '--report' && reportPath && !extra.length,
  'Usage: node bound-startup-glb.mjs input.glb output.glb --report report.json');
assert.equal(new Set([sourcePath, outputPath, reportPath].map(p => resolve(p))).size, 3, 'Use separate paths');
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const sourceBytes = await readFile(sourcePath), { doc, bin } = unpack(sourceBytes);
assert(doc.buffers.length === 1 && !doc.buffers[0].uri && !doc.extensionsUsed?.includes(EXT), 'Uncompressed self-contained GLB required');
const originalDoc = structuredClone(doc);
// A source bufferView may concatenate several attributes (or interleave them).
// Give every accessor a tightly packed view before filtering, keeping all
// accessor ids, component types, counts and primitive references unchanged.
const originalPayloads = [];
const newViews = [];
for (const accessor of doc.accessors ?? []) {
  assert(!accessor.sparse && accessor.bufferView !== undefined, 'Dense accessors required');
  const view = originalDoc.bufferViews[accessor.bufferView];
  assert.equal(view.buffer, 0); assert(!view.extensions, 'Uncompressed views required');
  const elementBytes = widths[accessor.componentType] * sizes[accessor.type];
  assert(elementBytes && !(accessor.type.startsWith('MAT') && accessor.componentType !== 5126), 'Unsupported accessor layout');
  const stride = view.byteStride ?? elementBytes;
  const sourceOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const end = sourceOffset + (accessor.count - 1) * stride + elementBytes;
  assert(end <= (view.byteOffset ?? 0) + view.byteLength, 'Accessor exceeds bufferView');
  const bytes = Buffer.alloc(accessor.count * elementBytes);
  for (let i = 0; i < accessor.count; i++) bin.copy(bytes, i * elementBytes, sourceOffset + i * stride, sourceOffset + i * stride + elementBytes);
  accessor.bufferView = newViews.length;
  delete accessor.byteOffset;
  newViews.push({ buffer: 0, byteLength: bytes.length, ...(view.target ? { target: view.target } : {}) });
  originalPayloads.push(bytes);
}
for (const image of doc.images ?? []) {
  assert(image.bufferView !== undefined && !image.uri, 'Embedded image required');
  const bytes = bytesOf(bin, originalDoc.bufferViews[image.bufferView]);
  image.bufferView = newViews.length;
  newViews.push({ buffer: 0, byteLength: bytes.length }); originalPayloads.push(bytes);
}
doc.bufferViews = newViews;
const repackedDoc = structuredClone(doc);
const imageViews = new Set((doc.images ?? []).map(i => i.bufferView));
const indexIds = new Set(), triangleIndexIds = new Set(), semanticByAccessor = new Map();
for (const mesh of doc.meshes ?? []) for (const p of mesh.primitives) {
  if (p.indices !== undefined) { indexIds.add(p.indices); if ((p.mode ?? 4) === 4) triangleIndexIds.add(p.indices); }
  for (const [semantic, id] of Object.entries(p.attributes)) {
    assert(!semanticByAccessor.has(id) || semanticByAccessor.get(id) === semantic, 'Shared accessor has different semantics');
    semanticByAccessor.set(id, semantic);
  }
}
let cursor = 0, fallbackCursor = 0;
const chunks = [], reports = [], expected = [];
function append(bytes) {
  const offset = align4(cursor); chunks.push(Buffer.alloc(offset - cursor), Buffer.from(bytes)); cursor = offset + bytes.length; return offset;
}
for (let vi = 0; vi < doc.bufferViews.length; vi++) {
  const view = doc.bufferViews[vi], raw = originalPayloads[vi];
  assert.equal(view.buffer, 0); assert(!view.extensions, 'Input has extension payload');
  const refs = doc.accessors.map((a, id) => ({ a, id })).filter(({ a }) => a.bufferView === vi);
  let best = null;
  const accessor = refs.length === 1 ? refs[0] : null;
  const semantic = accessor && (semanticByAccessor.get(accessor.id) ?? (indexIds.has(accessor.id) ? 'INDICES' : 'OTHER'));
  const floatPacked = accessor && accessor.a.componentType === 5126 && !accessor.a.sparse
    && !accessor.a.byteOffset && !view.byteStride
    && raw.length === accessor.a.count * sizes[accessor.a.type] * 4;
  if (!imageViews.has(vi) && refs.length && !refs.some(({ a }) => a.sparse)) {
    const indexOnly = refs.every(({ id }) => indexIds.has(id));
    const stride = view.byteStride ?? (refs.every(({ a }) => a.componentType === refs[0].a.componentType && a.type === refs[0].a.type)
      ? widths[refs[0].a.componentType] * sizes[refs[0].a.type] : 0);
    const mode = indexOnly ? 'INDICES' : 'ATTRIBUTES';
    if (stride && raw.length % stride === 0 && (indexOnly ? [2, 4].includes(stride) && !view.byteStride : stride % 4 === 0 && stride <= 256)) {
      const count = raw.length / stride, encoded = MeshoptEncoder.encodeGltfBuffer(raw, count, stride, mode);
      best = { encoded, decoded: raw, count, stride, mode, filter: undefined, maxError: 0, rmsError: 0 };
      if (accessor && triangleIndexIds.has(accessor.id) && count % 3 === 0) {
        const candidate = MeshoptEncoder.encodeGltfBuffer(raw, count, stride, 'TRIANGLES');
        const decoded = decode(candidate, count, stride, 'TRIANGLES');
        const a = stride === 2 ? new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length)) : new Uint32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
        const b = stride === 2 ? new Uint16Array(decoded.buffer) : new Uint32Array(decoded.buffer);
        for (let i = 0; i < count; i += 3) assert([0, 1, 2].some(rotation => [0, 1, 2].every(j => a[i + j] === b[i + (j + rotation) % 3])), 'Triangle vertices/order/winding changed');
        if (candidate.length < best.encoded.length) best = { encoded: candidate, decoded, count, stride, mode: 'TRIANGLES', filter: undefined, maxError: 0, rmsError: 0,
          cyclicTriangleRotationOnly: !Buffer.from(decoded).equals(raw) };
      }
      if (floatPacked && bounds[semantic] !== undefined) {
        const floats = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
        for (const expMode of filterParameters.exponentModes) {
          for (let bits = filterParameters.minimumBits; bits <= filterParameters.maximumBits; bits++) {
            const filtered = MeshoptEncoder.encodeFilterExp(floats, count, stride, bits, expMode);
            const candidate = MeshoptEncoder.encodeGltfBuffer(filtered, count, stride, 'ATTRIBUTES');
            const decoded = decode(candidate, count, stride, 'ATTRIBUTES', 'EXPONENTIAL');
            const error = difference(floats, new Float32Array(decoded.buffer));
            if (error.maxError <= bounds[semantic]) {
              if (candidate.length < best.encoded.length) best = { encoded: candidate, decoded,
                count, stride, mode, filter: 'EXPONENTIAL', bits, expMode, ...error };
              break;
            }
          }
        }
      }
    }
  }
  if (best && best.encoded.length + 200 < raw.length) {
    const offset = append(best.encoded);
    fallbackCursor = align4(fallbackCursor); view.buffer = 1; view.byteOffset = fallbackCursor; fallbackCursor += raw.length;
    view.extensions = { [EXT]: { buffer: 0, byteOffset: offset, byteLength: best.encoded.length,
      byteStride: best.stride, count: best.count, mode: best.mode, ...(best.filter ? { filter: best.filter } : {}) } };
    expected.push(Buffer.from(best.decoded));
    if (best.filter && floatPacked) {
      const values = new Float32Array(best.decoded.buffer, best.decoded.byteOffset, best.decoded.byteLength / 4);
      const { min, max } = extrema(values, sizes[accessor.a.type]);
      if (accessor.a.min || semantic === 'POSITION') accessor.a.min = min;
      if (accessor.a.max || semantic === 'POSITION') accessor.a.max = max;
    }
    reports.push({ view: vi, accessor: accessor?.id, semantic, inputBytes: raw.length, outputBytes: best.encoded.length,
      mode: best.mode, cyclicTriangleRotationOnly: best.cyclicTriangleRotationOnly ?? false, filter: best.filter ?? 'NONE', bits: best.bits, exponentMode: best.expMode, bound: bounds[semantic], maxError: best.maxError, rmsError: best.rmsError });
  } else {
    view.byteOffset = append(raw); expected.push(Buffer.from(raw));
    if (accessor) reports.push({ view: vi, accessor: accessor.id, semantic: semantic ?? (indexIds.has(accessor.id) ? 'INDICES' : 'OTHER'),
      inputBytes: raw.length, outputBytes: raw.length, filter: 'NONE', maxError: 0, rmsError: 0 });
  }
}
doc.buffers = [{ byteLength: cursor }, { byteLength: fallbackCursor, extensions: { [EXT]: { fallback: true } } }];
for (const key of ['extensionsUsed', 'extensionsRequired']) doc[key] = [...new Set([...(doc[key] ?? []), EXT])];
const outputBytes = pack(doc, Buffer.concat(chunks, cursor)), output = unpack(outputBytes);
let verifiedBytes = 0;
for (let vi = 0; vi < output.doc.bufferViews.length; vi++) {
  const view = output.doc.bufferViews[vi], ext = view.extensions?.[EXT];
  const decoded = ext ? decode(bytesOf(output.bin, ext), ext.count, ext.byteStride, ext.mode, ext.filter) : bytesOf(output.bin, view);
  assert(Buffer.from(decoded).equals(expected[vi]), `Output decode differs from checked values at view ${vi}`);
  if ((!reports.find(r => r.view === vi)?.filter || reports.find(r => r.view === vi)?.filter === 'NONE') && !reports.find(r => r.view === vi)?.cyclicTriangleRotationOnly)
    assert(Buffer.from(decoded).equals(originalPayloads[vi]), `Exact view ${vi} changed`);
  verifiedBytes += decoded.length;
  const attributeReport = reports.find(r => r.view === vi);
  const accessor = attributeReport && output.doc.accessors[attributeReport.accessor];
  if (accessor?.componentType === 5126) {
    const before = new Float32Array(originalPayloads[vi].buffer.slice(originalPayloads[vi].byteOffset, originalPayloads[vi].byteOffset + originalPayloads[vi].length));
    const after = new Float32Array(decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.length));
    const error = difference(before, after);
    assert(error.maxError <= (bounds[attributeReport.semantic] ?? 0), 'Decoded FLOAT error exceeds bound');
    Object.assign(attributeReport, error, { componentType: accessor.componentType, type: accessor.type, count: accessor.count,
      sourceRange: extrema(before, sizes[accessor.type]), outputRange: extrema(after, sizes[accessor.type]) });
    if (attributeReport.filter !== 'NONE') {
      if (accessor.min) assert.deepEqual(accessor.min, attributeReport.outputRange.min, 'Accessor min does not match decoded data');
      if (accessor.max) assert.deepEqual(accessor.max, attributeReport.outputRange.max, 'Accessor max does not match decoded data');
    }
  }
}
for (const key of ['nodes', 'meshes', 'materials', 'textures', 'images', 'samplers', 'scenes', 'scene', 'animations', 'skins'])
  assert.deepEqual(doc[key], repackedDoc[key], `${key} changed`);
for (let i = 0; i < doc.accessors.length; i++) {
  const a = { ...doc.accessors[i] }, b = { ...repackedDoc.accessors[i] };
  delete a.min; delete a.max; delete b.min; delete b.max;
  assert.deepEqual(a, b, `Accessor ${i} layout changed`);
}
await mkdir(dirname(outputPath), { recursive: true }); await writeFile(outputPath, outputBytes);
const report = { source: sourcePath, output: outputPath, inputBytes: sourceBytes.length, outputBytes: outputBytes.length,
  sourceSha256: sha256(sourceBytes), outputSha256: sha256(outputBytes), bounds, filterParameters,
  nodes: doc.nodes?.length ?? 0, meshes: doc.meshes?.length ?? 0,
  triangles: (doc.meshes ?? []).flatMap(m => m.primitives).reduce((sum, p) => {
    assert.equal(p.mode ?? 4, 4, 'Triangle primitives required for triangle count');
    return sum + doc.accessors[p.indices ?? p.attributes.POSITION].count / 3;
  }, 0),
  verification: { runtimeDecoder: 'three/examples/jsm/libs/meshopt_decoder.module.js', verifiedBytes,
    indicesExact: !reports.some(r => r.cyclicTriangleRotationOnly), trianglesVerticesOrderAndWindingExact: true, topologyExact: true, attributesRetainFloat: true, minMaxRecomputed: true, accessorIdsAndCountsExact: true, accessorValuesRepackedExactlyBeforeFiltering: true,
    imageBytesExact: true, sceneAndMaterialsExact: true }, attributes: reports };
await mkdir(dirname(reportPath), { recursive: true }); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ source: sourcePath, inputBytes: sourceBytes.length, outputBytes: outputBytes.length }));
