import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { pixelRatio } from '../rendering/pixel-budget.js';
import { createAmbience } from './audio.js';

function multisampleCount(renderer, quality) {
  const gl = renderer.getContext();
  // The context-wide maximum alone does not guarantee HDR/depth format support.
  const color = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) || [];
  const depth = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES) || [];
  const limit = Math.min(renderer.capabilities.maxSamples, quality === 'low' ? 2 : 4);
  return Math.max(0, ...Array.from(color).filter(samples => samples > 1 && samples <= limit && depth.includes(samples)));
}

/** Canvas host shared by all viewing assets; it owns rendering and audio resources. */
export async function createSceneViewer({ createScene, canvas, assetBaseUrl, quality = 'balanced',
  signal, reducedMotion = false, mood, cameraMode = 'auto', onFrame, onError, ambience = createAmbience() } = {}) {
  if (!canvas || typeof createScene !== 'function') throw new Error('A canvas and createScene factory are required');
  signal?.throwIfAborted();
  const loading = new AbortController();
  let renderer, asset, composer, bloom, output, antialias, renderPass, resizeObserver, intersection;
  let samples = 0;
  let frame = 0, last = 0, renderCount = 0, lastNotification = -1;
  let disposed = false, visible = false, pageSuspended = false, contextLost = false;
  const state = { ready: false, paused: reducedMotion, active: false, mood, camera: cameraMode };
  const abort = () => { loading.abort(signal?.reason); dispose(); };
  signal?.addEventListener('abort', abort, { once: true });
  const active = () => !disposed && state.ready && visible && !document.hidden && !pageSuspended && !contextLost;
  const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
  const notify = () => onFrame?.(snapshot());
  function draw() {
    if (!active()) return;
    renderer.info.reset(); composer.render(); renderCount++;
    canvas.dataset.renderCount = String(renderCount);
  }
  function tick(now) {
    frame = 0;
    if (!active() || state.paused) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    try {
      asset.update(dt); draw();
      if (now - lastNotification > 300) { lastNotification = now; notify(); }
    } catch (error) {
      state.paused = true; stop(); void ambience.visibility(true).catch(() => {}); onError?.(error); return;
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    const wasActive = state.active;
    state.active = active();
    void ambience.visibility(!state.active || state.paused).catch(() => {});
    if (!state.active || state.paused) stop();
    else if (!frame) frame = requestAnimationFrame(tick);
    if (!wasActive && state.active && state.paused) draw();
  }
  function resize() {
    if (!asset || disposed) return;
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(pixelRatio(width, height, { maxPixels: quality === 'low' ? 1000000 : 1800000, maxDpr: 1.75 }));
    renderer.setSize(width, height, false); asset.resize(width, height);
    composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(width, height);
    draw();
  }
  function pageHide(event) { if (event.persisted) { pageSuspended = true; sync(); } else dispose(); }
  function pageShow() { pageSuspended = false; sync(); resize(); }
  function lost(event) {
    event.preventDefault(); contextLost = true; sync();
    onError?.(new Error('画面暂时中断，请重新载入场景。'));
  }
  function snapshot() {
    return { ...state, ...(asset?.snapshot() || {}), ready: state.ready, paused: state.paused,
      active: state.active, disposed, sound: ambience.enabled, renderCount,
      render: renderer ? { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        width: canvas.width, height: canvas.height, antialias: samples ? 'msaa' : 'fxaa', samples,
        ...renderer.info.memory } : null };
  }
  function dispose() {
    if (disposed) return;
    disposed = true; state.ready = false; state.active = false;
    loading.abort(); stop(); ambience.dispose();
    resizeObserver?.disconnect(); intersection?.disconnect();
    document.removeEventListener('visibilitychange', sync);
    window.removeEventListener('pagehide', pageHide); window.removeEventListener('pageshow', pageShow);
    canvas.removeEventListener('webglcontextlost', lost);
    signal?.removeEventListener('abort', abort);
    asset?.dispose(); bloom?.dispose(); output?.dispose(); antialias?.dispose(); renderPass?.dispose(); composer?.dispose();
    renderer?.dispose(); renderer?.forceContextLoss();
  }
  try {
    // The scene is drawn into the composer, so default-framebuffer MSAA is wasted.
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.info.autoReset = false;
    asset = await createScene({ renderer, assetBaseUrl, quality, signal: loading.signal, mood, cameraMode, reducedMotion });
    if (disposed) { asset.dispose(); throw new DOMException('Preview cancelled', 'AbortError'); }
    samples = multisampleCount(renderer, quality);
    // Composer owns this HDR target and its clone, including their renderbuffers.
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, samples,
    }));
    renderPass = new RenderPass(asset.scene, asset.camera);
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.45, 1.05);
    output = new OutputPass();
    composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(output);
    if (samples) {
      // RenderPass and Bloom keep the scene in readBuffer; screen output needs no
      // swap. Avoid allocating a second HDR multisample/depth buffer each frame.
      output.needsSwap = false;
      composer.writeBuffer.samples = 0;
      composer.writeBuffer.depthBuffer = false;
    } else {
      // Some WebGL2 devices cannot multisample RGBA16F at this quality budget.
      // FXAA needs display-space color, so it follows tone mapping in OutputPass.
      antialias = new FXAAPass(); composer.addPass(antialias);
    }
    state.ready = true; state.camera = asset.state.camera;
    ambience.setMood(mood);
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
    intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; sync(); });
    intersection.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', pageHide); window.addEventListener('pageshow', pageShow);
    canvas.addEventListener('webglcontextlost', lost);
    sync(); resize(); notify();
  } catch (error) { dispose(); throw error; }
  return {
    state, scene: asset.scene, camera: asset.camera, boat: asset.boat, renderer,
    async setBoat(id) {
      if (!state.ready || !asset.setBoat) throw new Error('当前场景不支持换船');
      const change = asset.setBoat(id);
      notify();
      try { return await change; }
      finally { if (!disposed) { draw(); notify(); } }
    },
    setPaused(value) { state.paused = !!value; sync(); draw(); notify(); return state.paused; },
    setMood(name) {
      const preset = asset.setMood(name, { immediate: state.paused });
      state.mood = name; ambience.setMood(name); draw(); notify(); return preset;
    },
    setCamera(name) {
      asset.setCamera(name, { immediate: state.paused }); state.camera = asset.state.camera; draw(); notify();
    },
    async setSound(value) { const result = await ambience.setEnabled(value); sync(); notify(); return result; },
    reset() { asset.reset(); draw(); notify(); },
    resize,
    capture() {
      if (disposed || !active()) return Promise.reject(new Error('场景尚未准备好'));
      draw();
      return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('照片未能保存')), 'image/png'));
    },
    snapshot, dispose,
  };
}
