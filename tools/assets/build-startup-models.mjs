#!/usr/bin/env node
/** Rebuild reviewable startup GLBs separately from the original/full library.
 * Usage: node tools/assets/build-startup-models.mjs --python /path/to/python-with-pillow
 *   [--source-root artifacts/performance/2026-10-05/originals/assets/library]
 *   [--output-root tools/local/startup-models]
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const options = { '--python': 'python3', '--source-root': 'artifacts/performance/2026-10-05/originals/assets/library', '--output-root': 'tools/local/startup-models' };
const args = process.argv.slice(2);
assert(args.length % 2 === 0, 'Every option needs a value');
for (let i = 0; i < args.length; i += 2) {
  assert(args[i] in options, `Unknown option: ${args[i]}`); options[args[i]] = args[i + 1];
}
const sourceRoot = resolve(root, options['--source-root']), outputRoot = resolve(root, options['--output-root']);
assert(!outputRoot.startsWith(sourceRoot + '/') && sourceRoot !== outputRoot, 'Keep source library immutable');
assert(!outputRoot.startsWith(join(root, 'public') + '/'), 'Generate candidates outside public; review before publishing');
const models = [
  { id: 'maverick-gt', textureSize: 512 }, { id: 'ocean-buoy', textureSize: 256 },
  { id: 'futuristic-speedboat', textureSize: 512 }, { id: 'riva-aquarama', textureSize: 512 },
  { id: 'modular-wooden-pier', textureSize: 256, selectedNode: 'modular_wooden_pier_planks' },
  ...['rock-09', 'rock-face-01', 'painted-wooden-bench', 'wooden-crate-02', 'lifebuoy'].map(id => ({ id, textureSize: 256 })),
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (executable, commandArgs) => {
  const result = spawnSync(executable, commandArgs, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr ?? `Exit ${result.status}`);
};
for (const model of models) {
  const source = join(sourceRoot, model.id, 'model.glb'), out = join(outputRoot, model.id);
  const originalHash = sha256(await readFile(source));
  const prepared = join(out, 'prepared.glb'), output = join(out, 'model.glb');
  const textureReport = join(out, 'textures.json'), geometryReport = join(out, 'geometry.json');
  const prepareArgs = [join(root, 'tools/assets/prepare-startup-glb.py'), source, prepared, '--report', textureReport, '--max-texture-size', String(model.textureSize),
    ...(model.selectedNode ? ['--node', model.selectedNode] : [])];
  const boundArgs = [join(root, 'tools/assets/bound-startup-glb.mjs'), prepared, output, '--report', geometryReport];
  run(options['--python'], prepareArgs); run(process.execPath, boundArgs);
  const textures = JSON.parse(await readFile(textureReport)), geometry = JSON.parse(await readFile(geometryReport));
  assert.equal(sha256(await readFile(source)), originalHash, 'Source changed');
  assert.equal(geometry.outputSha256, sha256(await readFile(output)), 'Candidate hash differs from verification');
  assert.equal(textures.output_sha256, geometry.sourceSha256, 'Report chain does not match');
  Object.assign(model, { source, sourceSha256: originalHash, output, runtimePath: `/assets/runtime/${model.id}.glb`,
    bytes: geometry.outputBytes, sha256: geometry.outputSha256, sourceBytes: textures.original_bytes,
    nodes: geometry.nodes, triangles: geometry.triangles, textures: textures.images, attributes: geometry.attributes,
    geometryBounds: geometry.bounds, verification: { preparation: textures.verification, geometry: geometry.verification },
    commands: [{ executable: options['--python'], arguments: prepareArgs }, { executable: process.execPath, arguments: boundArgs }] });
  console.log(`${model.id}: ${model.bytes} bytes, ${model.nodes} nodes, ${model.triangles} triangles`);
}
const groups = { arena: ['maverick-gt', 'ocean-buoy'], swamp: ['futuristic-speedboat'], cove: ['riva-aquarama', 'modular-wooden-pier', 'rock-09', 'rock-face-01'] };
const budgets = Object.fromEntries(Object.entries(groups).map(([page, ids]) => {
  const bytes = models.filter(model => ids.includes(model.id)).reduce((sum, model) => sum + model.bytes, 0);
  assert(bytes <= 1_500_000, `${page}: ${bytes} bytes exceeds 1.5 MB model budget`);
  return [page, { models: ids, bytes, limit: 1_500_000 }];
}));
const report = { generatedAt: new Date().toISOString(), sourceRoot, outputRoot,
  constraints: { noSimplification: true, triangleVerticesOrderAndWindingPreserved: true,
    floatAccessorsRetained: true, nodeSubsetOnlyForPier: true, originalLibraryUntouched: true,
    note: 'Texture dimensions reduced; FLOAT precision bounded; triangle encoding may rotate each triangle first vertex cyclically.' },
  parameters: { bounds: models[0].geometryBounds, textureResampling: 'Pillow Lanczos',
    meshoptimizerVersion: JSON.parse(await readFile(join(root, 'node_modules/meshoptimizer/package.json'))).version,
    threeVersion: JSON.parse(await readFile(join(root, 'node_modules/three/package.json'))).version,
    generatorSha256: Object.fromEntries(await Promise.all(['prepare-startup-glb.py', 'bound-startup-glb.mjs', 'optimize-glb.py', 'build-startup-models.mjs']
      .map(async file => [file, sha256(await readFile(join(root, 'tools/assets', file)))]))) }, budgets, models };
await mkdir(dirname(join(outputRoot, 'report.json')), { recursive: true });
await writeFile(join(outputRoot, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ budgets, report: join(outputRoot, 'report.json') }));
