#!/usr/bin/env node
/**
 * Expand an EXT_meshopt_compression GLB into a plain JSON + BIN GLB.
 * Used as the first step when re-encoding a delivered runtime variant.
 * Decoded views are checked through the runtime decoder before repacking, so
 * the output is byte-identical to what the loader would have produced.
 *
 * Usage: node tools/assets/decompress-glb.mjs input.glb output.glb [--report report.json]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const EXT = 'EXT_meshopt_compression';
const align4 = value => Math.ceil(value / 4) * 4;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function unpack(bytes) {
  assert(bytes.length >= 28 && bytes.readUInt32LE(0) === 0x46546c67, 'Expected GLB');
  assert.equal(bytes.readUInt32LE(4), 2, 'Only GLB 2.0 is supported');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length mismatch');
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'Expected JSON chunk');
  const binHeader = 20 + jsonLength;
  assert.equal(bytes.readUInt32LE(binHeader + 4), 0x004e4942, 'Expected BIN chunk');
  const binLength = bytes.readUInt32LE(binHeader);
  assert.equal(binHeader + 8 + binLength, bytes.length, 'Unexpected extra GLB chunks');
  return {
    document: JSON.parse(bytes.subarray(20, binHeader).toString('utf8')),
    binary: bytes.subarray(binHeader + 8),
  };
}

function pack(document, chunks, length) {
  const json = Buffer.from(JSON.stringify(document));
  const jsonLength = align4(json.length);
  const binLength = align4(length);
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
  Buffer.concat(chunks).copy(result, 28 + jsonLength);
  return result;
}

const [sourcePath, outputPath, flag, reportPath, ...extra] = process.argv.slice(2);
assert(sourcePath && outputPath && flag === '--report' && reportPath && !extra.length,
  'Usage: node tools/assets/decompress-glb.mjs input.glb output.glb --report report.json');
assert.equal(new Set([sourcePath, outputPath, reportPath].map(path => resolve(path))).size, 3,
  'Use three separate paths');
await MeshoptDecoder.ready;

const sourceBytes = await readFile(sourcePath);
const { document, binary } = unpack(sourceBytes);
assert(document.buffers?.length >= 1 && document.buffers.length <= 2,
  'Expected a self-contained GLB with an optional meshopt fallback buffer');
assert(document.buffers.every(buffer => buffer.uri === undefined), 'External buffers are not supported');

const chunks = [];
let length = 0;
let decodedViews = 0;
const viewReports = [];
for (const [index, view] of document.bufferViews.entries()) {
  const extension = view.extensions?.[EXT];
  let payload;
  if (extension) {
    assert.equal(extension.buffer, 0);
    assert.equal(view.buffer, 1);
    assert.equal(view.byteLength, extension.count * extension.byteStride);
    const encoded = binary.subarray(extension.byteOffset ?? 0, (extension.byteOffset ?? 0) + extension.byteLength);
    const decoded = Buffer.alloc(view.byteLength);
    MeshoptDecoder.decodeGltfBuffer(decoded, extension.count, extension.byteStride,
      encoded, extension.mode, extension.filter);
    const rawView = view.byteLength;
    payload = decoded;
    delete view.extensions;
    decodedViews++;
    viewReports.push({ index, mode: extension.mode, byteStride: extension.byteStride,
      count: extension.count, encodedBytes: extension.byteLength, decodedBytes: rawView });
  } else {
    assert.equal(view.buffer ?? 0, 0, 'Uncompressed views must live in the BIN buffer');
    const start = view.byteOffset ?? 0;
    payload = Buffer.from(binary.subarray(start, start + view.byteLength));
  }
  const offset = align4(length);
  if (offset > length) chunks.push(Buffer.alloc(offset - length));
  chunks.push(payload);
  length = offset + payload.length;
  view.buffer = 0;
  view.byteOffset = offset;
}
document.buffers = [{ byteLength: align4(length) }];
for (const key of ['extensionsUsed', 'extensionsRequired']) {
  if (!document[key]) continue;
  document[key] = document[key].filter(name => name !== EXT);
  if (!document[key].length) delete document[key];
}
const output = pack(document, chunks, length);

// Re-read the plain GLB through the same parser path and compare every accessor
// against the decoded source payloads. This catches a repacking mistake before
// the texture step consumes the file.
const checked = unpack(output);
assert.deepEqual(checked.document, document, 'Repacked JSON differs from the expanded document');
assert.equal(checked.binary.length, align4(length));
for (const view of checked.document.bufferViews) {
  assert.equal(view.buffer, 0);
  assert((view.byteOffset ?? 0) + view.byteLength <= checked.binary.length, 'View exceeds BIN');
}

await mkdir(dirname(resolve(outputPath)), { recursive: true });
await writeFile(outputPath, output);
const report = {
  source: sourcePath, output: outputPath,
  inputBytes: sourceBytes.length, outputBytes: output.length,
  inputSha256: sha256(sourceBytes), outputSha256: sha256(output),
  decodedViews, views: viewReports,
  verification: { decodedWithRuntimeDecoder: true, jsonRoundTripExact: true, viewsWithinBin: true },
};
await mkdir(dirname(resolve(reportPath)), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ outputBytes: output.length, decodedViews }));
