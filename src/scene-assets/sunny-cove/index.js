import * as THREE from 'three';
import { createSceneViewer } from '../../shared/viewing/viewer.js';
import { createBoatWaterInteraction } from '../boat-water-interaction/index.js';
import { createCoveEnvironment } from './environment.js';
import { createCoveDock } from './dock.js';
import { createCoveWater } from './water.js';
import { createCoveBoat } from './boat.js';
import { COVE_ROUTE, createCoveNavigation, stepCoveNavigation, resetCoveNavigation } from './navigation.js';
import { createCoveCamera, CAMERA_MODES } from './camera.js';
import { MOODS } from './presets.js';
import { BOATS, DEFAULT_BOAT_ID, getBoatDefinition } from './config/boats.js';
import { COVE_TOUR, routeAtBerth } from './config/tour.js';

export { MOODS, CAMERA_MODES, BOATS, DEFAULT_BOAT_ID, COVE_TOUR };
export { createCoveDock };
export { createCoveWater, createCoveBoat, createCoveCamera, createCoveNavigation };
export { createBoatWaterInteraction };

/** An independently owned composition. Renderer/RAF remain with the consumer. */
export async function createSunnyCoveScene({ renderer, assetBaseUrl, quality = 'balanced',
  signal, mood = 'afternoon', cameraMode = 'auto', reducedMotion = false,
  boatId = DEFAULT_BOAT_ID, tour = COVE_TOUR } = {}) {
  if (!renderer || !assetBaseUrl) throw new Error('Sunny Cove requires renderer and assetBaseUrl');
  if (!Object.hasOwn(MOODS, mood)) throw new Error(`Unknown Sunny Cove mood: ${mood}`);
  const definition = getBoatDefinition(boatId);
  signal?.throwIfAborted();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 1600);
  let boat;
  const water = createCoveWater(scene, { quality });
  let interaction;
  const rig = createCoveCamera(camera, { ...tour.camera, reducedMotion });
  const state = { elapsed: 0, mood, boatId, boatChange: { status: 'idle', requestedId: boatId, error: null }, camera: reducedMotion && cameraMode === 'auto' ? 'scenic' : cameraMode };
  rig.setMode(state.camera);
  let environment, boatVisual, dock, disposed = false, selectionRequest, selectionVersion = 0;
  const loading = new AbortController();
  const abort = () => loading.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  function dispose() {
    if (disposed) return; disposed = true; selectionVersion++; selectionRequest?.abort(); loading.abort();
    signal?.removeEventListener('abort', abort);
    rig.dispose(); water.setInteraction(null); water.dispose(); interaction?.dispose();
    boatVisual?.dispose(); dock?.dispose(); environment?.dispose();
  }
  try {
    const results = await Promise.allSettled([
      createCoveEnvironment(scene, { renderer, assetBaseUrl, quality, mood, signal: loading.signal })
        .catch(error => { loading.abort(); throw error; }),
      createCoveBoat(scene, new URL(definition.path, assetBaseUrl).href, { signal: loading.signal, definition })
        .catch(error => { loading.abort(); throw error; }),
      createCoveDock(scene, { ...tour.dock, assetBaseUrl, signal: loading.signal, deferDetails: true })
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
    boat = createCoveNavigation({ ...tour.navigation, route: routeAtBerth(COVE_ROUTE, dock.getAnchor('berth')) });
    interaction = createBoatWaterInteraction({ ...boatVisual.dimensions, ...definition.contact, sampleSurface: water.sampleSurface });
    water.setInteraction(interaction); rig.setBoatDimensions(boatVisual.dimensions);
    water.setMood(MOODS[mood], { immediate: true });
    interaction.reset(0, boat);
    boatVisual.update(0, 0, boat, interaction.pose); environment.update(0, 0, boat);
    water.update(0, boat); rig.snap(boat);
  } catch (error) { dispose(); throw error; }
  // Boat, water, dock structure and coast paint before optional foliage/furniture.
  environment.startDetails(); dock.startDetails();
  const detailReady = Promise.allSettled([environment.detailReady, dock.detailReady]).then(results => {
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  });
  detailReady.catch(() => {});
  async function setBoat(id) {
    const nextDefinition = getBoatDefinition(id);
    if (disposed) return false;
    const version = ++selectionVersion;
    selectionRequest?.abort();
    if (id === state.boatId) {
      selectionRequest = undefined;
      state.boatChange = { status: 'idle', requestedId: id, error: null };
      return true;
    }
    const request = new AbortController(); selectionRequest = request;
    const cancel = () => request.abort(loading.signal.reason);
    loading.signal.addEventListener('abort', cancel, { once: true });
    state.boatChange = { status: 'loading', requestedId: id, error: null };
    let candidate, nextInteraction;
    try {
      // Parse outside the rendered scene. Only the newest successful selection
      // can replace the live hull; failed/cancelled loads leave it untouched.
      candidate = await createCoveBoat(new THREE.Group(), new URL(nextDefinition.path, assetBaseUrl).href,
        { signal: request.signal, definition: nextDefinition });
      if (disposed || request.signal.aborted || version !== selectionVersion) return false;
      nextInteraction = createBoatWaterInteraction({ ...candidate.dimensions, ...nextDefinition.contact,
        sampleSurface: water.sampleSurface });
      const previousVisual = boatVisual, previousInteraction = interaction;
      resetCoveNavigation(boat, { atBerth: true, dwellDuration: tour.changeoverDwell });
      nextInteraction.reset(state.elapsed, boat);
      candidate.update(0, state.elapsed, boat, nextInteraction.pose);
      rig.setBoatDimensions(candidate.dimensions); rig.snap(boat);
      scene.add(candidate.group); boatVisual = candidate; interaction = nextInteraction;
      water.setInteraction(interaction); water.update(state.elapsed, boat);
      state.boatId = id; state.boatChange = { status: 'idle', requestedId: id, error: null };
      candidate = undefined; nextInteraction = undefined;
      previousVisual.dispose(); previousInteraction.dispose();
      return true;
    } catch (error) {
      if (disposed || request.signal.aborted || version !== selectionVersion) return false;
      state.boatChange = { status: 'error', requestedId: id, error: '换船未完成，当前船仍可观赏。请再试一次。' };
      throw error;
    } finally {
      candidate?.dispose(); nextInteraction?.dispose();
      loading.signal.removeEventListener('abort', cancel);
      if (selectionRequest === request) selectionRequest = undefined;
    }
  }
  return {
    scene, camera, boat, state, environment, dock, water,
    get boatVisual() { return boatVisual; },
    get interaction() { return interaction; },
    setBoat,
    detailReady,
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
    snapshot() { return { ...state, boatChange: { ...state.boatChange }, boat: { ...boat },
      dimensions: { ...boatVisual.dimensions }, camera: rig.snapshot(), interaction: interaction.snapshot(),
      detailState: {
        status: [environment, dock].some(part => ['waiting', 'loading'].includes(part.detailState.status))
          ? 'loading' : [environment, dock].some(part => part.detailState.status === 'error') ? 'error' : 'ready',
        error: [environment, dock].map(part => part.detailState.error).filter(Boolean).join('; ') || null,
        environment: { ...environment.detailState }, dock: { ...dock.detailState },
      }, disposed }; },
    dispose,
  };
}

/** Both the dedicated page and library preview use this exact host. */
export async function createSunnyCoveViewer(options = {}) {
  let asset;
  const viewer = await createSceneViewer({ ...options, mood: options.mood ?? 'afternoon',
    createScene: async sceneOptions => (asset = await createSunnyCoveScene({ ...sceneOptions, boatId: options.boatId, tour: options.tour })) });
  // A paused/reduced-motion viewer still needs one fresh frame when details arrive.
  const refreshDetails = () => { if (viewer.state.ready) viewer.setPaused(viewer.state.paused); };
  for (const part of [asset.environment, asset.dock]) {
    void part.detailReady.then(refreshDetails, refreshDetails).catch(error => options.onError?.(error));
  }
  return viewer;
}
