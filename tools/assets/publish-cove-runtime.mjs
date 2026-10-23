#!/usr/bin/env node
/**
 * Publish reviewed runtime variants and refresh the delivery manifest.
 * Refuses to overwrite a file that changed after the optimization report ran.
 *
 * All inputs are validated before the first write. Files are staged and renamed;
 * if anything fails, replaced files and the manifest are restored, so a failed
 * publish never leaves the model set and the manifest out of sync.
 *
 * Usage: node tools/assets/publish-cove-runtime.mjs [--report tools/local/cove-runtime/report.json]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const reportPath = process.argv.includes('--report')
  ? process.argv[process.argv.indexOf('--report') + 1]
  : 'tools/local/cove-runtime/report.json';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const runtimeRoot = join(root, 'public/assets/runtime');
const manifestPath = join(runtimeRoot, 'asset-manifest.json');
const report = JSON.parse(await readFile(join(root, reportPath), 'utf8'));
const manifestText = await readFile(manifestPath, 'utf8');
const manifest = JSON.parse(manifestText);
const published = new Set((await readdir(runtimeRoot)).filter(file => file.endsWith('.glb')).map(file => file.slice(0, -4)));
assert.deepEqual([...published].sort(), report.models.map(model => model.id).sort(),
  'Report and published runtime models differ');

const entries = new Map(manifest.assets.map(asset => [asset.id, asset]));
const note = '2026-10-22：纹理按错误上限重新编码为 AVIF 4:4:4 或 WebP（透明通道无损），移除未被材质引用的顶点属性；三角形拓扑与船体尺寸未变。';
const operations = [];
// Phase 1: validate every model and build the complete manifest in memory.
for (const model of report.models) {
  const source = join(runtimeRoot, `${model.id}.glb`);
  const current = await readFile(source);
  assert.equal(sha(current), model.inputSha256, `${model.id}: published file changed after optimization`);
  const optimizedPath = join(root, 'tools/local/cove-runtime', model.id, 'optimized.glb');
  const optimized = await readFile(optimizedPath);
  assert.equal(sha(optimized), model.outputSha256, `${model.id}: optimized file hash differs from report`);
  const entry = entries.get(model.id);
  assert(entry, `${model.id}: missing manifest entry`);
  entry.bytes = optimized.length;
  entry.sha256 = model.outputSha256;
  entry.triangles = model.triangles;
  entry.textureDimensions = model.textures.map(texture => texture.dimensions);
  entry.textureFormats = model.textures.map(texture => texture.format.replace('image/', ''));
  entry.droppedAttributes = model.droppedAttributes;
  const geometry = JSON.parse(await readFile(join(root, 'tools/local/cove-runtime', model.id, 'geometry.json'), 'utf8'));
  const semantics = new Set(geometry.attributes.map(attribute => attribute.semantic));
  entry.geometryBounds = Object.fromEntries(Object.entries(geometry.bounds)
    .filter(([name]) => semantics.has(name)));
  const previous = entry.changes ?? '';
  entry.changes = previous.includes('2026-10-22')
    ? previous
    : `${previous.replace(/[.。]\s*$/, '')}${previous ? '；' : ''}${note}`;
  operations.push({ id: model.id, source, current, optimized, optimizedPath });
}
manifest.assets = [...entries.values()];
const staged = operations.map(operation => ({
  ...operation, temporary: `${operation.source}.publish-${process.pid}`,
}));

// Phase 2: write only after all validation passed. A failure restores the exact
// bytes observed in phase 1 and the original manifest text.
try {
  for (const operation of staged) await writeFile(operation.temporary, operation.optimized);
  for (const operation of staged) await rename(operation.temporary, operation.source);
  const manifestTemporary = `${manifestPath}.publish-${process.pid}`;
  await writeFile(manifestTemporary, JSON.stringify(manifest, null, 2) + '\n');
  await rename(manifestTemporary, manifestPath);
} catch (error) {
  for (const operation of staged) {
    try { await writeFile(operation.source, operation.current); } catch { /* Best-effort rollback. */ }
    try { await unlink(operation.temporary); } catch { /* Already renamed or never created. */ }
  }
  await writeFile(manifestPath, manifestText);
  throw error;
}
console.log(JSON.stringify({ published: report.models.length, bytes: report.summary.outputBytes }, null, 2));
