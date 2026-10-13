import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const root = new URL('../../dist/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', root), 'utf8'));
function closure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  assert.ok(manifest[key], `Missing chunk: ${key}`); seen.add(key);
  for (const imported of manifest[key].imports || []) closure(imported, seen);
  return seen;
}

const entrypoints = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry).map(([key]) => key);
assert.deepEqual(entrypoints, ['index.html'], 'Production must contain only the Sunny Cove application entry');
const graph = [...closure('index.html')];
for (const name of ['three-core', 'three-webgl', 'postprocessing']) {
  assert.equal(graph.filter(key => manifest[key].name === name).length, 1, `Sunny Cove needs one shared ${name} chunk`);
}
for (const [key, chunk] of Object.entries(manifest)) {
  assert.doesNotMatch(`${key} ${chunk.src ?? ''}`, /(?:^|[ /])(?:arena|swamp|moonwater|library)\//,
    `${key}: removed scenes and the local material workbench must stay outside production`);
}
let initialBytes = 0, initialGzip = 0;
for (const key of graph) {
  const data = await readFile(new URL(manifest[key].file, root));
  initialBytes += data.length; initialGzip += gzipSync(data).length;
}
let largest = 0, total = 0;
for (const file of new Set(Object.values(manifest).map(chunk => chunk.file))) {
  const bytes = (await stat(new URL(file, root))).size;
  largest = Math.max(largest, bytes); total += bytes;
  assert.ok(bytes <= 500_000, `${file} exceeds 500 KB`);
}
async function directoryBytes(url) {
  let bytes = 0;
  for (const entry of await readdir(url, { withFileTypes: true })) {
    const target = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url);
    bytes += entry.isDirectory() ? await directoryBytes(target) : (await stat(target)).size;
  }
  return bytes;
}
const publishedBytes = await directoryBytes(root);
assert.ok(publishedBytes <= 85_000_000, `Published directory ${publishedBytes} exceeds the 85 MB compatibility budget`);
console.log(JSON.stringify({ productionEntries: entrypoints, initialJsBytes: initialBytes,
  initialJsGzip: initialGzip, largestChunkBytes: largest, totalJsBytes: total,
  publishedBytes, publishedBudgetBytes: 85_000_000, sharedEngine: true }, null, 2));
