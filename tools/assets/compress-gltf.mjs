#!/usr/bin/env node
/**
 * Losslessly compress a self-contained GLB with EXT_meshopt_compression.
 * Usage: node tools/assets/compress-gltf.mjs input.glb output.glb [--report report.json]
 * Keeps accessor types, element order, images and scene JSON unchanged. Unsupported
 * buffer layouts are copied verbatim. Every output view is checked with the same
 * MeshoptDecoder shipped by the runtime's pinned Three.js version.
 * https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_meshopt_compression
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MeshoptEncoder } from 'meshoptimizer';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const EXTENSION = 'EXT_meshopt_compression';
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const align4 = value => Math.ceil(value / 4) * 4;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function unpack(bytes) {
  assert(bytes.length >= 28 && bytes.readUInt32LE(0) === 0x46546c67, 'Expected GLB');
  assert.equal(bytes.readUInt32LE(4), 2, 'Only GLB 2.0 is supported');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length mismatch');
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'Expected JSON chunk');
  const binHeader = 20 + jsonLength;
  assert(binHeader + 8 <= bytes.length, 'Missing BIN chunk');
  assert.equal(bytes.readUInt32LE(binHeader + 4), 0x004e4942, 'Expected BIN chunk');
  const binLength = bytes.readUInt32LE(binHeader);
  assert.equal(binHeader + 8 + binLength, bytes.length, 'Extra GLB chunks are unsupported');
  const document = JSON.parse(bytes.subarray(20, binHeader).toString('utf8'));
  return { document, binary: bytes.subarray(binHeader + 8) };
}

function pack(document, binary) {
  const json = Buffer.from(JSON.stringify(document));
  const jsonLength = align4(json.length);
  const binLength = align4(binary.length);
  const result = Buffer.alloc(28 + jsonLength + binLength);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonLength, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  result.fill(0x20, 20, 20 + jsonLength);
  json.copy(result, 20);
  result.writeUInt32LE(binLength, 20 + jsonLength);
  result.writeUInt32LE(0x004e4942, 24 + jsonLength);
  binary.copy(result, 28 + jsonLength);
  return result;
}

function viewBytes(binary, view) {
  const offset = view.byteOffset ?? 0;
  assert(Number.isSafeInteger(offset) && offset >= 0 && offset + view.byteLength <= binary.length,
    'bufferView exceeds BIN chunk');
  return binary.subarray(offset, offset + view.byteLength);
}

function layoutFor(view, accessors, indexAccessors, imageViews, viewIndex) {
  if (imageViews.has(viewIndex) || view.extensions || !accessors.length || !view.byteLength) return null;
  // Sparse payloads, padded integer matrices and ambiguous mixed layouts stay raw.
  if (accessors.some(({ accessor }) => accessor.sparse)) return null;
  const indexOnly = accessors.every(({ index }) => indexAccessors.has(index));
  if (indexOnly) {
    const size = COMPONENT_BYTES[accessors[0].accessor.componentType];
    if (![2, 4].includes(size) || view.byteStride || accessors.some(({ accessor }) =>
      accessor.type !== 'SCALAR' || COMPONENT_BYTES[accessor.componentType] !== size)) return null;
    if (view.byteLength % size) return null;
    return { mode: 'INDICES', byteStride: size, count: view.byteLength / size };
  }
  if (accessors.some(({ index }) => indexAccessors.has(index))) return null;
  const sizes = new Set(accessors.map(({ accessor }) => {
    const size = COMPONENT_BYTES[accessor.componentType];
    if (accessor.type.startsWith('MAT') && size < 4) return 0;
    return size * TYPE_COMPONENTS[accessor.type];
  }));
  const stride = view.byteStride ?? (sizes.size === 1 ? [...sizes][0] : 0);
  if (!stride || stride % 4 || stride > 256 || view.byteLength % stride) return null;
  return { mode: 'ATTRIBUTES', byteStride: stride, count: view.byteLength / stride };
}

/** Decode from the repacked GLB, rather than trusting in-memory encoder output. */
export async function verifyCompressedGlb(sourceBytes, outputBytes) {
  await MeshoptDecoder.ready;
  const source = unpack(sourceBytes);
  const output = unpack(outputBytes);
  const preserved = document => {
    const copy = structuredClone(document);
    delete copy.buffers;
    delete copy.bufferViews;
    for (const key of ['extensionsUsed', 'extensionsRequired']) {
      if (copy[key]) {
        copy[key] = copy[key].filter(name => name !== EXTENSION);
        if (!copy[key].length) delete copy[key];
      }
    }
    return copy;
  };
  assert.deepEqual(preserved(output.document), preserved(source.document), 'Scene/accessor/image JSON changed');
  assert.equal(output.document.bufferViews.length, source.document.bufferViews.length);
  let verifiedBytes = 0;
  for (let index = 0; index < source.document.bufferViews.length; index++) {
    const originalView = source.document.bufferViews[index];
    const view = output.document.bufferViews[index];
    const extension = view.extensions?.[EXTENSION];
    const original = viewBytes(source.binary, originalView);
    let decoded;
    if (extension) {
      assert.equal(extension.buffer, 0);
      assert.equal(view.buffer, 1);
      assert.equal(view.byteLength, extension.byteStride * extension.count);
      const fallback = output.document.buffers[view.buffer];
      assert.equal(fallback.extensions?.[EXTENSION]?.fallback, true);
      assert(!fallback.uri && (view.byteOffset ?? 0) + view.byteLength <= fallback.byteLength);
      decoded = Buffer.alloc(view.byteLength);
      MeshoptDecoder.decodeGltfBuffer(decoded, extension.count, extension.byteStride,
        viewBytes(output.binary, extension), extension.mode, extension.filter);
    } else {
      assert.equal(view.buffer, 0);
      decoded = viewBytes(output.binary, view);
    }
    assert(original.equals(decoded), `bufferView ${index} is not byte-identical`);
    const metadata = structuredClone(view);
    metadata.buffer = originalView.buffer;
    if (originalView.byteOffset === undefined) delete metadata.byteOffset;
    else metadata.byteOffset = originalView.byteOffset;
    if (extension) {
      delete metadata.extensions[EXTENSION];
      if (!Object.keys(metadata.extensions).length) delete metadata.extensions;
    }
    assert.deepEqual(metadata, originalView, `bufferView ${index} metadata changed`);
    verifiedBytes += original.length;
  }
  return { verifiedViews: source.document.bufferViews.length, verifiedBytes };
}

export async function compressGlb(sourceBytes) {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const { document, binary } = unpack(sourceBytes);
  assert(document.buffers?.length === 1 && !document.buffers[0].uri,
    'Input must contain one self-contained BIN buffer');
  assert(!document.extensionsUsed?.includes(EXTENSION), 'Input is already meshopt compressed');
  const imageViews = new Set((document.images ?? []).map(image => image.bufferView));
  const indexAccessors = new Set((document.meshes ?? []).flatMap(mesh =>
    mesh.primitives.map(primitive => primitive.indices).filter(index => index !== undefined)));
  const byView = new Map();
  for (const [index, accessor] of (document.accessors ?? []).entries()) {
    if (accessor.bufferView === undefined) continue;
    if (!byView.has(accessor.bufferView)) byView.set(accessor.bufferView, []);
    byView.get(accessor.bufferView).push({ accessor, index });
  }
  const chunks = [];
  let binaryLength = 0;
  let fallbackLength = 0;
  const views = [];
  const append = bytes => {
    const offset = align4(binaryLength);
    if (offset > binaryLength) chunks.push(Buffer.alloc(offset - binaryLength));
    chunks.push(Buffer.from(bytes));
    binaryLength = offset + bytes.length;
    return offset;
  };
  for (const [index, view] of (document.bufferViews ?? []).entries()) {
    assert.equal(view.buffer, 0, 'Only BIN bufferViews are supported');
    const raw = viewBytes(binary, view);
    const layout = layoutFor(view, byView.get(index) ?? [], indexAccessors, imageViews, index);
    const encoded = layout && MeshoptEncoder.encodeGltfBuffer(raw, layout.count, layout.byteStride, layout.mode);
    // Account for extension JSON overhead; small views are usually cheaper raw.
    if (encoded && encoded.length + 200 < raw.length) {
      const byteOffset = append(encoded);
      view.buffer = 1;
      fallbackLength = Math.max(fallbackLength, (view.byteOffset ?? 0) + view.byteLength);
      view.extensions = { [EXTENSION]: { buffer: 0, byteOffset, byteLength: encoded.length, ...layout } };
      views.push({ index, inputBytes: raw.length, outputBytes: encoded.length, ...layout });
    } else {
      view.byteOffset = append(raw);
    }
  }
  document.buffers[0].byteLength = binaryLength;
  if (views.length) {
    document.buffers.push({ byteLength: fallbackLength, extensions: { [EXTENSION]: { fallback: true } } });
    for (const key of ['extensionsUsed', 'extensionsRequired']) {
      document[key] = [...new Set([...(document[key] ?? []), EXTENSION])];
    }
  }
  let output = pack(document, Buffer.concat(chunks, binaryLength));
  const retainedOriginal = output.length >= sourceBytes.length;
  if (retainedOriginal) output = Buffer.from(sourceBytes);
  const verification = await verifyCompressedGlb(sourceBytes, output);
  return { output, report: {
    inputBytes: sourceBytes.length, outputBytes: output.length,
    savedBytes: sourceBytes.length - output.length,
    reductionPercent: Number(((1 - output.length / sourceBytes.length) * 100).toFixed(2)),
    compressedViews: retainedOriginal ? 0 : views.length, retainedOriginal,
    inputSha256: sha256(sourceBytes), outputSha256: sha256(output),
    verification: { decoder: 'three/examples/jsm/libs/meshopt_decoder.module.js', ...verification },
    views: retainedOriginal ? [] : views,
  } };
}

async function main() {
  const [sourcePath, outputPath, flag, reportPath, ...extra] = process.argv.slice(2);
  assert(sourcePath && outputPath && !extra.length && (!flag || flag === '--report' && reportPath),
    'Usage: node tools/assets/compress-gltf.mjs input.glb output.glb [--report report.json]');
  assert.notEqual(resolve(sourcePath), resolve(outputPath), 'Use a separate output path to preserve the source');
  if (reportPath) {
    assert.notEqual(resolve(reportPath), resolve(sourcePath), 'Report must not overwrite the source');
    assert.notEqual(resolve(reportPath), resolve(outputPath), 'Report must not overwrite the output');
  }
  const { output, report } = await compressGlb(await readFile(sourcePath));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
  const summary = { source: sourcePath, output: outputPath, ...report };
  if (reportPath) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
  }
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
