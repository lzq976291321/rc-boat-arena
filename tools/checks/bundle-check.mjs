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
assert.ok(manifest['library/index.html'].dynamicImports?.includes('src/library/scene-preview.js'), 'Scene preview must be lazy');
const sceneAssets = new Map([
  ['src/scene-assets/moonwater/index.js', 'swamp/index.html'],
  ['src/scene-assets/sunny-cove/index.js', 'cove/index.html'],
]);
for (const [sceneAsset, page] of sceneAssets) {
  assert.ok(manifest['src/library/scene-preview.js'].dynamicImports?.includes(sceneAsset), `${sceneAsset} must load only when selected`);
  assert.ok(!closure('src/library/scene-preview.js').has(sceneAsset), 'Scene adapter must not eagerly load any renderer');
  assert.ok(closure(page).has(sceneAsset), `${page} and library must reuse the same scene asset`);
  for (const other of sceneAssets.keys()) if (other !== sceneAsset) assert.ok(!closure(sceneAsset).has(other), `${sceneAsset} eagerly loads the other scene`);
}
assert.ok(![...library].some(key => /three|viewer|gltf|postprocessing|arena|swamp|cove|moonwater|scene-assets/i.test(manifest[key].name)), 'Library eagerly imports 3D code');
let initialBytes = 0, initialGzip = 0;
for (const key of library) { const data = await readFile(new URL(manifest[key].file, root)); initialBytes += data.length; initialGzip += gzipSync(data).length; }
assert.ok(initialBytes <= 30000, `Library eager JS ${initialBytes} exceeds 30 KB`);
assert.ok(initialGzip <= 12000, `Library eager gzip ${initialGzip} exceeds 12 KB`);
const viewingEntries = [...sceneAssets.keys(), ...sceneAssets.values()];
for (const key of ['index.html', 'src/library/viewer.js', ...viewingEntries]) {
  const graph = [...closure(key)];
  assert.equal(graph.filter(id => manifest[id].name === 'three-core').length, 1, `${key} needs one shared core`);
  assert.equal(graph.filter(id => manifest[id].name === 'three-webgl').length, 1, `${key} needs one shared renderer`);
  if (!viewingEntries.includes(key)) assert.ok(!graph.some(id => manifest[id].name === 'postprocessing'), 'Bloom leaked outside viewing scenes');
  else assert.equal(graph.filter(id => manifest[id].name === 'postprocessing').length, 1, `${key} must use the shared postprocessing chunk`);
}
const sharedViewingChunks = [...closure('src/scene-assets/moonwater/index.js')].filter(key => closure('src/scene-assets/sunny-cove/index.js').has(key));
assert.ok(sharedViewingChunks.some(key => manifest[key].name === 'postprocessing'), 'Viewing scenes must share postprocessing');
// Rollup may name a shared chunk after any contained module (for example wake).
// Find the common host by its direct postprocessing dependency, not its label.
const viewingHosts = sharedViewingChunks.filter(key => manifest[key].imports?.some(imported => manifest[imported].name === 'postprocessing'));
assert.equal(viewingHosts.length, 1, 'Viewing scenes must have one shared Canvas host');
assert.ok(!library.has(viewingHosts[0]), 'The Canvas host must remain outside the static library');
let largest = 0, total = 0;
for (const file of new Set(Object.values(manifest).map(chunk => chunk.file))) {
  const bytes = (await stat(new URL(file, root))).size; largest = Math.max(largest, bytes); total += bytes;
  assert.ok(bytes <= 500000, `${file} exceeds 500 KB`);
}
console.log(JSON.stringify({ libraryEagerBytes: initialBytes, libraryEagerGzip: initialGzip, largestChunkBytes: largest, totalJsBytes: total, sharedEngine: true, lazyViewer: true }, null, 2));
