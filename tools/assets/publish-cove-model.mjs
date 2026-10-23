#!/usr/bin/env node
/**
 * Publish one rebuilt runtime model and update its manifest entry.
 * Used when a single asset is regenerated (for example a lower-poly tree)
 * instead of re-running the whole runtime optimization pass.
 *
 * Usage: node tools/assets/publish-cove-model.mjs --id jacaranda-tree
 *   --file tools/local/cove-tree-384/jacaranda-tree.glb
 *   --textures tools/local/cove-tree-384/jacaranda-tree/textures.json
 *   --geometry tools/local/cove-tree-384/jacaranda-tree/geometry.json
 *   --simplification tools/local/cove-tree-384/report.json
 *   --note "2026-10-22：叶冠减面至 80,611 面，贴图 384 上限。"
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const options = {};
assert.equal(args.length % 2, 0, 'Every option needs a value');
for (let index = 0; index < args.length; index += 2) options[args[index]] = args[index + 1];
for (const required of ['--id', '--file', '--textures', '--geometry']) {
  assert(options[required], `Missing ${required}`);
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const runtimeRoot = join(root, 'public/assets/runtime');
const manifestPath = join(runtimeRoot, 'asset-manifest.json');
const manifestText = await readFile(manifestPath, 'utf8');
const manifest = JSON.parse(manifestText);
const entry = manifest.assets.find(asset => asset.id === options['--id']);
assert(entry, `Unknown manifest id: ${options['--id']}`);

const bytes = await readFile(options['--file']);
const previousBytes = entry.bytes;
const destination = join(runtimeRoot, `${entry.id}.glb`);
const current = await readFile(destination);
const geometry = JSON.parse(await readFile(options['--geometry'], 'utf8'));
const textures = JSON.parse(await readFile(options['--textures'], 'utf8'));
assert.equal(geometry.outputBytes, bytes.length, 'Geometry report byte count differs');
assert.equal(geometry.outputSha256, sha(bytes), 'Geometry report hash differs');
const simplification = options['--simplification']
  ? JSON.parse(await readFile(options['--simplification'], 'utf8')) : null;
if (simplification) {
  const model = simplification.models?.find(item => item.id === options['--id']);
  assert(model, 'Simplification report has no matching model');
  assert.equal(model.bytes, bytes.length, 'Simplification report byte count differs');
  assert.equal(model.sha256, geometry.outputSha256, 'Simplification and geometry report chain differs');
} else {
  assert.equal(textures.output_sha256, geometry.sourceSha256, 'Texture and geometry report chain differs');
}
assert(bytes.length <= entry.bytes, 'New variant must not grow the current published file');

const jsonLength = bytes.readUInt32LE(12);
const document = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const imageMimes = (document.images ?? []).map(image => image.mimeType);
for (const mime of imageMimes) {
  assert(['image/avif', 'image/webp', 'image/jpeg', 'image/png'].includes(mime),
    `Unsupported image type: ${mime}`);
}
for (const texture of document.textures ?? []) {
  const source = texture.source ?? Object.values(texture.extensions ?? {})[0]?.source;
  const mime = document.images[source]?.mimeType;
  if (mime === 'image/avif') assert(texture.extensions?.EXT_texture_avif, 'Missing AVIF declaration');
  if (mime === 'image/webp') assert(texture.extensions?.EXT_texture_webp, 'Missing WebP declaration');
}

const semantics = new Set(geometry.attributes.map(attribute => attribute.semantic));
entry.bytes = bytes.length;
entry.sha256 = sha(bytes);
entry.triangles = geometry.triangles;
entry.textureDimensions = textures.images.map(image => image.output_dimensions);
entry.textureFormats = textures.images.map(image => image.output_format.replace('image/', ''));
entry.droppedAttributes = textures.dropped_attributes;
entry.geometryBounds = Object.fromEntries(Object.entries(geometry.bounds)
  .filter(([name]) => semantics.has(name)));
entry.verification = geometry.verification;
if (simplification) {
  const model = simplification.models.find(item => item.id === options['--id']);
  if (model.simplification) entry.simplification = model.simplification;
}
if (options['--note']) {
  const previous = entry.changes ?? '';
  entry.changes = previous.includes(options['--note'])
    ? previous
    : `${previous.replace(/[.。]\s*$/, '')}${previous ? '；' : ''}${options['--note']}`;
}
// Stage both writes; on failure restore the previous model and manifest text.
const temporary = `${destination}.publish-${process.pid}`;
try {
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
  const manifestTemporary = `${manifestPath}.publish-${process.pid}`;
  await writeFile(manifestTemporary, JSON.stringify(manifest, null, 2) + '\n');
  await rename(manifestTemporary, manifestPath);
} catch (error) {
  try { await writeFile(destination, current); } catch { /* Best-effort rollback. */ }
  try { await unlink(temporary); } catch { /* Already renamed or never created. */ }
  await writeFile(manifestPath, manifestText);
  throw error;
}
console.log(JSON.stringify({ id: entry.id, previousBytes, bytes: bytes.length,
  triangles: entry.triangles, formats: [...new Set(entry.textureFormats)], dropped: entry.droppedAttributes }, null, 2));
