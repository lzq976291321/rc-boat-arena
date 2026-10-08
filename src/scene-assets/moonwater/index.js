import * as THREE from 'three';
import { createSceneViewer } from '../../shared/viewing/viewer.js';
import { createEnvironment, riverCenter, riverHalfWidth } from './environment.js';
import { createWater, createWake } from './water.js';
import { createSwampBoat } from './boat.js';
import { createNavigation, stepNavigation, resetNavigation } from './navigation.js';
import { createViewingCamera, CAMERA_MODES } from './camera.js';
import { MOODS } from './presets.js';

export { CAMERA_MODES, MOODS };

/** A reusable composition. The caller owns its renderer and animation loop. */
export async function createMoonwaterScene({ renderer, assetBaseUrl, quality = 'balanced',
  signal, mood = 'moonlight', cameraMode = 'auto', reducedMotion = false } = {}) {
  if (!renderer || !assetBaseUrl) throw new Error('Moonwater requires renderer and assetBaseUrl');
  signal?.throwIfAborted();
  const base = new URL(assetBaseUrl);
  const assetUrl = path => new URL(path, base).href;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.15, 1400);
  const boat = createNavigation();
  const water = createWater(scene), wake = createWake(scene);
  water.exclude(wake.mesh);
  const rig = createViewingCamera(camera, { riverCenter, riverHalfWidth, reducedMotion });
  const state = { elapsed: 0, mood, camera: reducedMotion && cameraMode === 'auto' ? 'follow' : cameraMode };
  rig.setMode(state.camera);
  let environment, boatVisual, disposed = false;
  const loading = new AbortController();
  const abort = () => loading.abort(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  function dispose() {
    if (disposed) return;
    disposed = true; loading.abort();
    signal?.removeEventListener('abort', abort);
    rig.dispose(); wake.dispose(); water.dispose();
    boatVisual?.dispose(); environment?.dispose();
  }
  try {
    const results = await Promise.allSettled([
      createEnvironment(scene, { renderer, quality, mood, signal: loading.signal, assets: {
        treeUrl: assetUrl('swamp/island-tree.glb'),
        deadTreeUrl: assetUrl('swamp/dead-tree.glb'), fernUrl: assetUrl('swamp/fern.glb'),
      } }).catch(error => { loading.abort(); throw error; }),
      createSwampBoat(scene, assetUrl('library/futuristic-speedboat/model.glb'), { signal: loading.signal })
        .catch(error => { loading.abort(); throw error; }),
    ]);
    if (results[0].status === 'fulfilled') environment = results[0].value;
    if (results[1].status === 'fulfilled') boatVisual = results[1].value;
    signal?.throwIfAborted();
    const failed = results.find(result => result.status === 'rejected' && result.reason?.name !== 'AbortError')
      ?? results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    if (environment.warnings?.length) throw new Error(environment.warnings.join('; '));
    water.setMood(MOODS[mood], { immediate: true });
    boatVisual.update(0, 0, boat); environment.update(0, 0, boat);
    water.update(0, boat); wake.reset(); rig.snap(boat);
  } catch (error) { dispose(); throw error; }
  // Core readiness includes boat, water, banks and rooted procedural woodland.
  environment.startDetails();
  return {
    scene, camera, boat, state, environment, water, wake, boatVisual,
    detailReady: environment.detailReady,
    update(dt) {
      if (disposed) return;
      dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.05)) : 0;
      state.elapsed += dt;
      stepNavigation(boat, { cruise: true }, dt);
      boatVisual.update(dt, state.elapsed, boat);
      environment.update(dt, state.elapsed, boat);
      water.update(state.elapsed, boat); wake.update(dt, state.elapsed, boat);
      rig.update(dt, state.elapsed, boat);
    },
    setMood(name, { immediate = false } = {}) {
      if (!Object.hasOwn(MOODS, name)) throw new Error(`Unknown Moonwater mood: ${name}`);
      state.mood = name;
      const preset = environment.setMood(name, { immediate });
      water.setMood(preset, { immediate });
      return preset;
    },
    setCamera(name, { immediate = false } = {}) {
      rig.setMode(name); state.camera = rig.snapshot().mode;
      if (immediate) rig.snap(boat);
    },
    resize(width, height) { rig.resize(width, height); rig.snap(boat); water.resize(width, height); },
    reset() {
      resetNavigation(boat); state.elapsed = 0; wake.reset();
      boatVisual.update(0, 0, boat); environment.update(0, 0, boat);
      water.update(0, boat); rig.snap(boat);
    },
    snapshot() { return { ...state, boat: { ...boat }, camera: rig.snapshot(),
      detailState: { ...environment.detailState }, disposed }; },
    dispose,
  };
}

/** Backwards-compatible Moonwater configuration of the shared Canvas host. */
export async function createMoonwaterViewer(options = {}) {
  let asset;
  const viewer = await createSceneViewer({ ...options, mood: options.mood ?? 'moonlight',
    createScene: async sceneOptions => (asset = await createMoonwaterScene(sceneOptions)) });
  // Also repaint partial successes if another optional source failed.
  const refreshDetails = () => { if (viewer.state.ready) viewer.setPaused(viewer.state.paused); };
  void asset.detailReady.then(refreshDetails, refreshDetails).catch(error => options.onError?.(error));
  return viewer;
}
