import { readFile, mkdir, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENE_MODEL_VARIANTS } from '../../src/shared/assets/scene-models.js';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

// The full stock library remains available to the local workbench. Production
// carries only this composition, including its original source URLs and credits.
export async function covePublicFiles(root = projectRoot) {
  const catalog = JSON.parse(await readFile(path.join(root, 'public/assets/cove/asset-manifest.json'), 'utf8'));
  const files = new Set(['favicon.svg', 'assets/cove/asset-manifest.json', 'assets/cove/SOURCES.md',
    'assets/runtime/asset-manifest.json', 'assets/runtime/SOURCES.md']);
  for (const asset of catalog.assets) {
    if (!asset.path?.startsWith('/assets/') || asset.path.includes('..')) throw new Error(`Invalid public asset: ${asset.id}`);
    files.add(asset.path.slice(1));
    const runtime = SCENE_MODEL_VARIANTS[asset.path.slice('/assets/'.length)];
    if (runtime) files.add(`assets/${runtime}`);
    const sourceRecord = path.posix.join(path.posix.dirname(asset.path.slice(1)), 'SOURCES.md');
    await access(path.join(root, 'public', sourceRecord));
    files.add(sourceRecord);
  }
  return [...files].sort();
}

export function covePublicAssets() {
  let root, output;
  return {
    name: 'sunny-cove-public-assets', apply: 'build',
    configResolved(config) { root = config.root; output = path.resolve(root, config.build.outDir); },
    async writeBundle() {
      for (const file of await covePublicFiles(root)) {
        const target = path.join(output, file);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(path.join(root, 'public', file), target);
      }
      // Old bookmarks stay useful, with one rendering entry and one implementation.
      for (const route of ['cove', 'swamp', 'library']) {
        await mkdir(path.join(output, route), { recursive: true });
        await copyFile(path.join(root, 'cove/index.html'), path.join(output, route, 'index.html'));
      }
    },
  };
}
