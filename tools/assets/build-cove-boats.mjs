#!/usr/bin/env node
/** Build intact, texture-bounded Sunny Cove boat variants.
 * Original library files are never changed; every authored mesh stays present.
 * Usage: node tools/assets/build-cove-boats.mjs --python /path/to/python-with-pillow
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
assert(args.length === 0 || args.length === 2 && args[0] === '--python', 'Only --python PATH is supported');
const python = args[1] ?? 'python3';
const outputRoot = join(root, 'tools/local/cove-boats');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const models = [];
for (const id of ['motor-whaleboat', 'assault-boat']) {
  const source = join(root, 'public/assets/library', id, 'model.glb');
  const out = join(outputRoot, id); await mkdir(out, { recursive: true });
  const original = await readFile(source);
  const prepared = join(out, 'prepared.glb'), output = join(out, 'model.glb');
  const run = (executable, parameters) => {
    const result = spawnSync(executable, parameters, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  };
  run(python, [join(root, 'tools/assets/prepare-startup-glb.py'), source, prepared,
    '--report', join(out, 'textures.json'), '--max-texture-size', '512']);
  run(process.execPath, [join(root, 'tools/assets/bound-startup-glb.mjs'), prepared, output,
    '--report', join(out, 'geometry.json')]);
  const textures = JSON.parse(await readFile(join(out, 'textures.json')));
  const geometry = JSON.parse(await readFile(join(out, 'geometry.json')));
  assert.equal(hash(await readFile(source)), hash(original), 'Original GLB changed');
  assert.equal(textures.output_sha256, geometry.sourceSha256, 'Report chain differs');
  assert.equal(hash(await readFile(output)), geometry.outputSha256, 'Output differs');
  assert(geometry.outputBytes <= 1_500_000, 'Optional boat exceeds individual delivery budget');
  const model = { id, source: `public/assets/library/${id}/model.glb`, sourceBytes: original.length,
    sourceSha256: hash(original), runtimePath: `/assets/runtime/${id}.glb`,
    bytes: geometry.outputBytes, sha256: geometry.outputSha256, triangles: geometry.triangles,
    nodes: geometry.nodes, textures: textures.images, geometryBounds: geometry.bounds,
    verification: { preparation: textures.verification, geometry: geometry.verification } };
  models.push(model); console.log(`${id}: ${original.length} -> ${model.bytes} bytes, ${model.triangles} triangles`);
}
await writeFile(join(outputRoot, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(),
  constraints: { originalLibraryUntouched: true, fullAuthoredGeometry: true, noSimplification: true,
    maxTextureDimension: 512, materialAssignmentsPreserved: true }, models }, null, 2) + '\n');
