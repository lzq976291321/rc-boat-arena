// Regression: a failed runtime publish must not replace any model or the manifest.
// Runs an isolated copy of the publisher against a temporary fixture tree.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const OLD = { a: 'old-a-bytes', b: 'old-b-bytes' };
const NEW = { a: 'new-a-bytes', b: 'new-b-bytes' };

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'cove-publish-'));
  const runtime = join(directory, 'public/assets/runtime');
  const models = join(directory, 'tools/local/cove-runtime');
  await mkdir(runtime, { recursive: true });
  await mkdir(join(directory, 'tools/assets'), { recursive: true });
  await copyFile(join(root, 'tools/assets/publish-cove-runtime.mjs'),
    join(directory, 'tools/assets/publish-cove-runtime.mjs'));
  const assets = [];
  for (const id of ['a', 'b']) {
    await writeFile(join(runtime, `${id}.glb`), OLD[id]);
    await mkdir(join(models, id), { recursive: true });
    await writeFile(join(models, id, 'optimized.glb'), NEW[id]);
    await writeFile(join(models, id, 'geometry.json'), JSON.stringify({
      attributes: [{ semantic: 'POSITION' }], bounds: { POSITION: 0.0002 },
    }));
    assets.push({ id, path: `/assets/runtime/${id}.glb`, bytes: OLD[id].length,
      sha256: sha(OLD[id]), triangles: 1, changes: '' });
  }
  await writeFile(join(runtime, 'asset-manifest.json'),
    JSON.stringify({ version: 1, assets }, null, 2) + '\n');
  const report = {
    summary: { outputBytes: NEW.a.length + NEW.b.length },
    models: ['a', 'b'].map(id => ({
      id, inputSha256: sha(OLD[id]), outputSha256: sha(NEW[id]), triangles: 2,
      textures: [{ dimensions: [256, 256], format: 'image/avif' }], droppedAttributes: [],
    })),
  };
  await writeFile(join(models, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  return { directory, runtime, models, report };
}

function publish(directory) {
  return spawnSync(process.execPath, [join(directory, 'tools/assets/publish-cove-runtime.mjs')],
    { cwd: directory, encoding: 'utf8' });
}

test('a failed publish leaves every model and the manifest untouched', async () => {
  const { directory, runtime, models, report } = await fixture();
  try {
    // Make the second model stale, so validation fails after the first one was
    // checked. The old implementation had already replaced the first file here.
    report.models[1].inputSha256 = sha('stale-input');
    await writeFile(join(models, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    const before = await readFile(join(runtime, 'asset-manifest.json'), 'utf8');
    const result = publish(directory);
    assert.notEqual(result.status, 0, 'publish must fail on a stale input');
    assert.equal(await readFile(join(runtime, 'a.glb'), 'utf8'), OLD.a, 'first model was replaced');
    assert.equal(await readFile(join(runtime, 'b.glb'), 'utf8'), OLD.b, 'second model was replaced');
    assert.equal(await readFile(join(runtime, 'asset-manifest.json'), 'utf8'), before,
      'manifest changed after a failed publish');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a successful publish updates every model and the manifest together', async () => {
  const { directory, runtime } = await fixture();
  try {
    const result = publish(directory);
    assert.equal(result.status, 0, result.stderr);
    for (const id of ['a', 'b']) {
      assert.equal(await readFile(join(runtime, `${id}.glb`), 'utf8'), NEW[id]);
    }
    const manifest = JSON.parse(await readFile(join(runtime, 'asset-manifest.json'), 'utf8'));
    for (const entry of manifest.assets) {
      assert.equal(entry.sha256, sha(NEW[entry.id]));
      assert.equal(entry.bytes, NEW[entry.id].length);
      assert.equal(entry.triangles, 2);
      assert.deepEqual(entry.textureDimensions, [[256, 256]]);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
