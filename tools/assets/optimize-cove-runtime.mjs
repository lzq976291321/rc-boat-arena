#!/usr/bin/env node
/**
 * Re-encode every delivered Sunny Cove runtime GLB without touching geometry:
 * decode meshopt -> AVIF/WebP textures + unused attribute pruning -> meshopt.
 *
 * Outputs stay under tools/local/cove-runtime for review; publish separately.
 * Requires a Python with Pillow (see --python).
 *
 * Usage: node tools/assets/optimize-cove-runtime.mjs --python /path/to/python3
 *        [--only riva-aquarama,maverick-gt] [--output-root tools/local/cove-runtime]
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const options = { '--python': 'python3', '--output-root': 'tools/local/cove-runtime', '--only': '' };
assert.equal(args.length % 2, 0, 'Every option needs a value');
for (let index = 0; index < args.length; index += 2) {
  assert(options[args[index]] !== undefined, `Unknown option: ${args[index]}`);
  options[args[index]] = args[index + 1];
}
const outputRoot = resolve(root, options['--output-root']);
assert(!outputRoot.startsWith(join(root, 'public') + '/'), 'Review outputs before publishing to public');
const only = options['--only'] ? new Set(options['--only'].split(',')) : undefined;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function run(executable, parameters) {
  const result = spawnSync(executable, parameters, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || `${executable} failed`);
  return result.stdout;
}

function inspectGlb(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  const imageMimes = (document.images ?? []).map(image => image.mimeType);
  const textureExtensions = new Set();
  for (const texture of document.textures ?? []) {
    for (const name of Object.keys(texture.extensions ?? {})) textureExtensions.add(name);
  }
  const attributes = new Set();
  let triangles = 0;
  for (const mesh of document.meshes ?? []) for (const primitive of mesh.primitives) {
    Object.keys(primitive.attributes).forEach(name => attributes.add(name));
    if (primitive.indices !== undefined) triangles += document.accessors[primitive.indices].count / 3;
  }
  return { document, imageMimes, textureExtensions, attributes, triangles };
}

const runtimeRoot = join(root, 'public/assets/runtime');
const manifest = JSON.parse(await readFile(join(runtimeRoot, 'asset-manifest.json'), 'utf8'));
const files = manifest.assets.map(asset => `${asset.id}.glb`)
  .filter(file => !only || only.has(file.slice(0, -4))).sort();
assert(files.length, 'No runtime models selected');
await mkdir(outputRoot, { recursive: true });

const models = [];
for (const file of files) {
  const id = file.slice(0, -4);
  const source = join(runtimeRoot, file);
  const input = await readFile(source);
  const directory = join(outputRoot, id);
  await mkdir(directory, { recursive: true });
  const decoded = join(directory, 'decoded.glb');
  const prepared = join(directory, 'prepared.glb');
  const output = join(directory, 'optimized.glb');
  const decompressReport = join(directory, 'decompress.json');
  const textureReport = join(directory, 'textures.json');
  const geometryReport = join(directory, 'geometry.json');

  run(process.execPath, [join(root, 'tools/assets/decompress-glb.mjs'), source, decoded, '--report', decompressReport]);
  run(options['--python'], [join(root, 'tools/assets/prepare-startup-glb.py'), decoded, prepared,
    '--report', textureReport, '--max-texture-size', '512', '--avif', '--webp',
    '--drop-unused-attributes', '--color-psnr', '36', '--data-psnr', '38']);
  run(process.execPath, [join(root, 'tools/assets/bound-startup-glb.mjs'), prepared, output, '--report', geometryReport]);

  const outputBytes = await readFile(output);
  const before = inspectGlb(input);
  const after = inspectGlb(outputBytes);
  const textures = JSON.parse(await readFile(textureReport));
  const geometry = JSON.parse(await readFile(geometryReport));
  assert.equal(sha(await readFile(source)), sha(input), 'Runtime source changed during optimization');
  assert.equal(after.triangles, before.triangles, `${id}: triangle count changed`);
  for (const name of before.attributes) {
    if (after.attributes.has(name)) continue;
    assert(textures.dropped_attributes.includes(name), `${id}: attribute ${name} disappeared`);
  }
  for (const name of after.attributes) assert(before.attributes.has(name), `${id}: unexpected attribute ${name}`);
  assert(outputBytes.length < input.length, `${id}: optimized file is not smaller`);
  assert.equal(geometry.outputSha256, sha(outputBytes), `${id}: geometry report hash differs`);
  for (const mime of after.imageMimes) {
    // AVIF/WebP must pass their PSNR floor; textures whose source is already
    // lossy keep JPEG when neither new format can meet it without degradation.
    assert(['image/avif', 'image/webp', 'image/jpeg', 'image/png'].includes(mime),
      `${id}: unexpected image type ${mime}`);
  }
  if (after.imageMimes.includes('image/avif')) assert(after.textureExtensions.has('EXT_texture_avif'), `${id}: missing AVIF declaration`);
  if (after.imageMimes.includes('image/webp')) assert(after.textureExtensions.has('EXT_texture_webp'), `${id}: missing WebP declaration`);
  for (const name of after.attributes) assert(!/^TEXCOORD_[1-9]/.test(name) && name !== 'TANGENT',
    `${id}: unused attribute survived: ${name}`);

  const record = {
    id, source: `public/assets/runtime/${file}`, output: `tools/local/cove-runtime/${id}/optimized.glb`,
    inputBytes: input.length, outputBytes: outputBytes.length,
    savedBytes: input.length - outputBytes.length,
    savedPercent: Number(((1 - outputBytes.length / input.length) * 100).toFixed(2)),
    inputSha256: sha(input), outputSha256: sha(outputBytes), triangles: after.triangles,
    imageBytes: {
      input: textures.images.reduce((total, image) => total + image.original_bytes, 0),
      output: textures.images.reduce((total, image) => total + image.output_bytes, 0),
    },
    textures: textures.images.map(image => ({ name: image.name ?? null, dimensions: image.output_dimensions,
      format: image.output_format, quality: image.quality, psnrDb: image.psnr_db, outputBytes: image.output_bytes })),
    textureExtensions: [...after.textureExtensions].sort(), droppedAttributes: textures.dropped_attributes,
    verification: geometry.verification,
  };
  models.push(record);
  console.log(`${id.padEnd(24)} ${(input.length / 1024).toFixed(0).padStart(5)}K -> ${(outputBytes.length / 1024).toFixed(0).padStart(5)}K  -${record.savedPercent}%`);
}

const summary = models.reduce((total, model) => ({
  inputBytes: total.inputBytes + model.inputBytes,
  outputBytes: total.outputBytes + model.outputBytes,
  imageInputBytes: total.imageInputBytes + model.imageBytes.input,
  imageOutputBytes: total.imageOutputBytes + model.imageBytes.output,
}), { inputBytes: 0, outputBytes: 0, imageInputBytes: 0, imageOutputBytes: 0 });
await writeFile(join(outputRoot, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(),
  parameters: { maxTextureSize: 512, colorPsnr: 36, dataPsnr: 38, avif: true, webp: true,
    dropUnusedAttributes: true, avifSpeed: 8 },
  constraints: { geometryUnchanged: true, triangleCountUnchanged: true, libraryOriginalsUntouched: true },
  summary, models }, null, 2) + '\n');
console.log(JSON.stringify({ models: models.length, ...summary }, null, 2));
