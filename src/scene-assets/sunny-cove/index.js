import * as THREE from 'three';
import { createSceneViewer } from '../../shared/viewing/viewer.js';
import { createBoatWaterInteraction } from '../boat-water-interaction/index.js';
import { createCoveEnvironment } from './environment.js';
import { createCoveDock } from './dock.js';
import { createCoveWater } from './water.js';
import { createCoveBoat } from './boat.js';
import { createCoveNavigation, stepCoveNavigation, resetCoveNavigation } from './navigation.js';
import { createCoveCamera, CAMERA_MODES } from './camera.js';
import { MOODS } from './presets.js';

export { MOODS, CAMERA_MODES };
export { createCoveDock };
export { createCoveWater, createCoveBoat, createCoveCamera, createCoveNavigation };
export { createBoatWaterInteraction };

/** An independently owned composition. Renderer/RAF remain with the consumer. */
export async function createSunnyCoveScene({ renderer, assetBaseUrl, quality = 'balanced',
  signal, mood = 'afternoon', cameraMode = 'auto', reducedMotion = false } = {}) {
  if (!renderer || !assetBaseUrl) throw new Error('Sunny Cove requires renderer and assetBaseUrl');
  if (!Object.hasOwn(MOODS, mood)) throw new Error(`Unknown Sunny Cove mood: ${mood}`);
  signal?.throwIfAborted();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 1600);
  const boat = createCoveNavigation();
  const water = createCoveWater(scene, { quality });
  const interaction = createBoatWaterInteraction({ sampleSurface: water.sampleSurface });
  water.setInteraction(interaction);
  const rig = createCoveCamera(camera, { reducedMotion });
  const state = { elapsed: 0, mood, camera: reducedMotion && cameraMode === 'auto' ? 'scenic' : cameraMode };
  rig.setMode(state.camera);
  let environment, boatVisual, dock, disposed = false;
  const loading = new AbortController();
  const abort = () => loading.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  function dispose() {
    if (disposed) return; disposed = true; loading.abort();
    signal?.removeEventListener('abort', abort);
    rig.dispose(); water.dispose(); interaction.dispose();
    boatVisual?.dispose(); dock?.dispose(); environment?.dispose();
  }
  try {
    const results = await Promise.allSettled([
      createCoveEnvironment(scene, { renderer, assetBaseUrl, quality, mood, signal: loading.signal })
        .catch(error => { loading.abort(); throw error; }),
      createCoveBoat(scene, new URL('library/riva-aquarama/model.glb', assetBaseUrl).href, { signal: loading.signal, length: 2.4 })
        .catch(error => { loading.abort(); throw error; }),
      createCoveDock(scene, { assetBaseUrl, signal: loading.signal })
        .catch(error => { loading.abort(); throw error; }),
    ]);
    if (results[0].status === 'fulfilled') environment = results[0].value;
    if (results[1].status === 'fulfilled') boatVisual = results[1].value;
    if (results[2].status === 'fulfilled') dock = results[2].value;
    signal?.throwIfAborted();
    // A failed model cancels its siblings. Preserve the real failure instead
    // of letting a sibling AbortError make the page silently keep loading.
    const failed = results.find(result => result.status === 'rejected' && result.reason?.name !== 'AbortError')
      ?? results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    if (environment.warnings?.length) throw new Error(environment.warnings.join('; '));
    water.setMood(MOODS[mood], { immediate: true });
    interaction.reset(0, boat);
    boatVisual.update(0, 0, boat, interaction.pose); environment.update(0, 0, boat);
    water.update(0, boat); rig.snap(boat);
  } catch (error) { dispose(); throw error; }
  finally { signal?.removeEventListener('abort', abort); }
  return {
    scene, camera, boat, state, environment, boatVisual, dock, water, interaction,
    update(dt) {
      if (disposed) return;
      dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .05)) : 0;
      state.elapsed += dt;
      stepCoveNavigation(boat, dt);
      water.update(state.elapsed, boat); interaction.update(dt, state.elapsed, boat);
      boatVisual.update(dt, state.elapsed, boat, interaction.pose); environment.update(dt, state.elapsed, boat);
      rig.update(dt, state.elapsed, boat);
    },
    setMood(name, { immediate = false } = {}) {
      if (!Object.hasOwn(MOODS, name)) throw new Error(`Unknown Sunny Cove mood: ${name}`);
      state.mood = name;
      const preset = environment.setMood(name, { immediate });
      water.setMood(preset, { immediate }); return preset;
    },
    setCamera(name, { immediate = false } = {}) {
      rig.setMode(name); state.camera = rig.snapshot().mode;
      if (immediate) rig.snap(boat);
    },
    resize(width, height) { rig.resize(width, height); rig.snap(boat); water.resize(width, height); },
    reset() {
      resetCoveNavigation(boat); state.elapsed = 0;
      water.update(0, boat); interaction.reset(0, boat);
      boatVisual.update(0, 0, boat, interaction.pose); environment.update(0, 0, boat);
      rig.snap(boat);
    },
    snapshot() { return { ...state, boat: { ...boat }, camera: rig.snapshot(), interaction: interaction.snapshot(), disposed }; },
    dispose,
  };
}

/** Both the dedicated page and library preview use this exact host. */
export function createSunnyCoveViewer(options = {}) {
  return createSceneViewer({ ...options, mood: options.mood ?? 'afternoon', createScene: createSunnyCoveScene });
}
