import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const root = new URL('../../dist/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', root), 'utf8'));
function closure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  assert.ok(manifest[key], `Missing chunk: ${key}`); seen.add(key);
  for (const imported of manifest[key].imports || []) closure(imported, seen);
  return seen;
}
const library = closure('library/index.html');
assert.ok(manifest['library/index.html'].dynamicImports?.includes('src/library/viewer.js'), 'Viewer must be lazy');
assert.ok(![...library].some(key => /three|viewer|gltf|postprocessing|arena|swamp/i.test(manifest[key].name)), 'Library eagerly imports 3D code');
let initialBytes = 0, initialGzip = 0;
for (const key of library) { const data = await readFile(new URL(manifest[key].file, root)); initialBytes += data.length; initialGzip += gzipSync(data).length; }
assert.ok(initialBytes <= 30000, `Library eager JS ${initialBytes} exceeds 30 KB`);
assert.ok(initialGzip <= 12000, `Library eager gzip ${initialGzip} exceeds 12 KB`);
for (const key of ['index.html', 'swamp/index.html', 'src/library/viewer.js']) {
  const graph = [...closure(key)];
  assert.equal(graph.filter(id => manifest[id].name === 'three-core').length, 1, `${key} needs one shared core`);
  assert.equal(graph.filter(id => manifest[id].name === 'three-webgl').length, 1, `${key} needs one shared renderer`);
  if (key !== 'swamp/index.html') assert.ok(!graph.some(id => manifest[id].name === 'postprocessing'), 'Bloom leaked outside swamp');
}
let largest = 0, total = 0;
for (const file of new Set(Object.values(manifest).map(chunk => chunk.file))) {
  const bytes = (await stat(new URL(file, root))).size; largest = Math.max(largest, bytes); total += bytes;
  assert.ok(bytes <= 500000, `${file} exceeds 500 KB`);
}
console.log(JSON.stringify({ libraryEagerBytes: initialBytes, libraryEagerGzip: initialGzip, largestChunkBytes: largest, totalJsBytes: total, sharedEngine: true, lazyViewer: true }, null, 2));
