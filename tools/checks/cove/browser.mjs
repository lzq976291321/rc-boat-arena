// Run through Vite: /tools/checks/cove/browser.html. Tests the real GLB loader,
// WebGL resources and scene API; leaves normal page preferences untouched.
import * as THREE from 'three';
import { createSunnyCoveScene } from '../../../src/scene-assets/sunny-cove/index.js';
import { modelBytes } from '../../../src/shared/assets/gltf.js';

const report = window.coveCheck = { status: 'running', passed: [], failures: [] };
const output = document.querySelector('#report');
const update = () => { output.textContent = JSON.stringify(report, null, 2); };
function check(condition, label) {
  if (!condition) throw new Error(label);
  report.passed.push(label); update();
}
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#view'), antialias: false });
renderer.setSize(640, 400, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.debug.onShaderError = () => { throw new Error('WebGL shader failed'); };
const originalRead = modelBytes.read;
let asset, survivor;
const render = () => { renderer.render(asset.scene, asset.camera); };
const visibleHulls = () => asset.scene.children.filter(object => object.userData.boatId).length;
try {
  asset = await createSunnyCoveScene({ renderer, assetBaseUrl: new URL('/assets/', location.href).href, quality: 'low' });
  asset.resize(640, 400); await asset.detailReady; render();
  check(asset.snapshot().boatId === 'riva-aquarama' && visibleHulls() === 1, 'default is exactly one real Riva');
  const scene = asset.scene, water = asset.water, environment = asset.environment;
  check(await asset.setBoat('maverick-gt'), 'switch to the real Maverick succeeds'); render();
  check(asset.scene === scene && asset.water === water && asset.environment === environment, 'switch preserves the water and environment instances');
  check(visibleHulls() === 1 && asset.boatVisual.boatId === 'maverick-gt', 'one selected hull is attached after replacement');
  check(asset.interaction.snapshot().motion.dimensions.beam > .9, 'contact uses measured Maverick beam');
  check(asset.water.mesh.material.uniforms.uContactShape === asset.interaction.uniforms.uContactShape,
    'water shader references the selected hull contact profile');
  check(asset.boat.phase === 'docked' && asset.interaction.snapshot().trail.count === 0, 'new boat rests at berth with a clean wake');
  let phases = new Set(), last = { ...asset.boat }, maxJump = 0;
  for (let frame = 0; frame < 112 * 60; frame++) {
    asset.update(1 / 60); phases.add(asset.boat.phase);
    maxJump = Math.max(maxJump, Math.hypot(asset.boat.x - last.x, asset.boat.z - last.z)); last = { ...asset.boat };
    if (frame % 600 === 0) render();
  }
  check(phases.size === 4 && maxJump < .025, 'real Maverick scene completes departure/cruise/arrival/mooring continuously');
  check(asset.snapshot().camera.berthWeight > .95, 'automatic camera favors the berth on arrival');
  const memories = [];
  for (let cycle = 0; cycle < 4; cycle++) {
    await asset.setBoat('riva-aquarama'); render();
    await asset.setBoat('maverick-gt'); render();
    memories.push({ ...renderer.info.memory });
  }
  check(memories.every(memory => memory.geometries === memories[0].geometries && memory.textures === memories[0].textures),
    'four complete switch pairs keep GPU geometry and texture counts stable');
  report.switchMemory = memories;
  const originalHull = asset.boatVisual, originalContact = asset.interaction;
  modelBytes.read = async (url, options) => {
    if (url.includes('riva-aquarama')) throw new Error('intentional candidate failure');
    return originalRead(url, options);
  };
  let failed = false;
  try { await asset.setBoat('riva-aquarama'); } catch { failed = true; }
  check(failed && asset.snapshot().boatChange.status === 'error', 'candidate failure is recoverable and reported');
  check(asset.boatVisual === originalHull && asset.interaction === originalContact && visibleHulls() === 1,
    'failed candidate leaves the live hull and contact untouched');
  modelBytes.read = originalRead;
  check(await asset.setBoat('riva-aquarama'), 'retry can select the same previously failed boat'); render();

  let release;
  const gate = new Promise(resolve => { release = resolve; });
  modelBytes.read = async (url, options) => {
    if (url.includes('maverick-gt')) await gate;
    return originalRead(url, options);
  };
  const delayed = asset.setBoat('maverick-gt');
  check(asset.snapshot().boatChange.status === 'loading' && asset.snapshot().boatId === 'riva-aquarama', 'pending candidate keeps the current boat visible');
  check(await asset.setBoat('riva-aquarama'), 'reselecting the current boat cancels a pending change');
  release();
  check(await delayed === false && asset.snapshot().boatId === 'riva-aquarama' && visibleHulls() === 1,
    'late cancelled result cannot overwrite the latest selection');
  modelBytes.read = originalRead;
  const frozen = JSON.stringify({ boat: asset.boat, interaction: asset.interaction.snapshot() });
  asset.update(0);
  check(JSON.stringify({ boat: asset.boat, interaction: asset.interaction.snapshot() }) === frozen, 'zero elapsed time freezes the boat and wake');
  for (const mood of ['afternoon', 'sunset', 'bluehour']) { asset.setMood(mood, { immediate: true }); render(); }
  check(asset.state.mood === 'bluehour', 'all three palettes compile with the selected boat and water shader');
  survivor = await createSunnyCoveScene({ renderer, assetBaseUrl: new URL('/assets/', location.href).href,
    quality: 'low', boatId: 'maverick-gt' });
  survivor.resize(640, 400); await survivor.detailReady;
  asset.dispose(); asset.dispose();
  survivor.update(1 / 60); renderer.render(survivor.scene, survivor.camera);
  check(survivor.boatVisual.boatId === 'maverick-gt' && !survivor.snapshot().disposed, 'disposing one independent scene leaves another usable');
  survivor.dispose();
  const empty = new THREE.Scene(), emptyCamera = new THREE.PerspectiveCamera(); renderer.render(empty, emptyCamera);
  report.afterDisposal = { ...renderer.info.memory };
  check(renderer.info.memory.geometries === 0, 'disposing both scenes releases their GPU geometries');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failures.push(error.stack || String(error));
} finally {
  modelBytes.read = originalRead; asset?.dispose(); survivor?.dispose();
  renderer.dispose(); renderer.forceContextLoss(); update();
}
