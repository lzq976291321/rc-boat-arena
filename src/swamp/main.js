import * as THREE from "three";
import { pixelRatio } from "../shared/rendering/pixel-budget.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createEnvironment } from "./environment.js";
import { createWater, createWake } from "./water.js";
import { createSwampBoat } from "./boat.js";
import {
  createNavigation,
  stepNavigation,
  resetNavigation,
} from "./navigation.js";
import { createAmbience } from "./audio.js";

const $ = (id) => document.getElementById(id);
const errors = [];
window.addEventListener("error", (e) => errors.push(e.message));
window.addEventListener("unhandledrejection", (e) =>
  errors.push(String(e.reason)),
);
const state = {
  ready: false,
  driving: false,
  cruise: false,
  paused: false,
  mood: "moonlight",
  camera: "follow",
  elapsed: 0,
};
const boat = createNavigation(),
  keys = new Set(),
  touch = new Set(),
  ambience = createAmbience();
let renderer,
  scene,
  camera,
  environment,
  water,
  wake,
  boatVisual,
  composer,
  toastTimer,
  previousFocus;
const assetRoot = new URL("../assets/swamp/", document.baseURI);
const url = (file) => new URL(file, assetRoot).href;
const debug = (window.__SWAMP__ = {
  state,
  boat,
  errors,
  assets: [],
  snapshot: () => ({
    ready: state.ready,
    ...state,
    boat: { ...boat },
    errors: [...errors],
    render: renderer
      ? {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          width: renderer.domElement.width,
          height: renderer.domElement.height,
        }
      : null,
  }),
});
$("retry").addEventListener("click", () => location.reload());
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3000);
}
function clearInput() {
  keys.clear();
  touch.clear();
}
function updateCruise() {
  $("cruise").setAttribute("aria-pressed", String(state.cruise));
  $("cruise").textContent = state.cruise ? "Ⅱ 巡航中" : "▷ 自动巡航";
}
function start(cruise = false) {
  if (!state.ready) return;
  state.driving = true;
  state.cruise = cruise;
  state.paused = false;
  document.body.dataset.driving = "true";
  $("intro").hidden = true;
  $("journey").hidden = false;
  $("drive-toolbar").hidden = false;
  $("touch-controls").hidden = !(
    navigator.maxTouchPoints > 0 ||
    matchMedia("(any-pointer:coarse)").matches ||
    innerWidth < 700
  );
  updateCruise();
  toast(
    cruise
      ? "已开始巡航 · 按方向键随时接管"
      : innerWidth < 700
        ? "按住 ↑ 前进，配合 ← → 转向"
        : "W / ↑ 前进 · A / D 转向 · S / ↓ 倒车",
  );
}
function openDialog(id) {
  clearInput();
  previousFocus = document.activeElement;
  state.paused = true;
  $(id).showModal();
}
function closeDialog(dialog) {
  dialog.close();
  clearInput();
  state.paused = false;
  previousFocus?.focus?.({ preventScroll: true });
}
$("start").addEventListener("click", () => start(false));
$("tour").addEventListener("click", () => start(true));
$("cruise").addEventListener("click", () => {
  state.cruise = !state.cruise;
  clearInput();
  updateCruise();
});
$("pause").addEventListener("click", () => openDialog("pause-dialog"));
$("credits-open").addEventListener("click", () => openDialog("credits-dialog"));
$("resume").addEventListener("click", () => closeDialog($("pause-dialog")));
$("reset").addEventListener("click", () => {
  resetNavigation(boat);
  wake.reset();
  state.cruise = false;
  updateCruise();
  closeDialog($("pause-dialog"));
  snapCamera();
  toast("已回到月光水道的出发点");
});
for (const dialog of document.querySelectorAll("dialog")) {
  dialog
    .querySelector("[data-close]")
    .addEventListener("click", () => closeDialog(dialog));
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog(dialog);
  });
  dialog.addEventListener("click", (e) => {
    const r = dialog.getBoundingClientRect();
    if (
      e.target === dialog &&
      (e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom)
    )
      closeDialog(dialog);
  });
}
function toggleCamera() {
  state.camera = state.camera === "follow" ? "scenic" : "follow";
  $("camera").textContent =
    state.camera === "follow" ? "镜头 · 跟随" : "镜头 · 侧览";
}
$("camera").addEventListener("click", toggleCamera);
const driveKeys = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);
window.addEventListener("keydown", (e) => {
  if (
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    e.target.isContentEditable ||
    e.target.closest?.("input,textarea,select")
  )
    return;
  if (document.querySelector("dialog[open]") || !state.ready) return;
  if (e.code === "Space" && e.target.closest?.("button,a,input")) return;
  if (driveKeys.has(e.code)) {
    e.preventDefault();
    if (!state.driving) start();
    state.cruise = false;
    updateCruise();
    keys.add(e.code);
  }
  if (!e.repeat && e.code === "KeyC" && state.driving) toggleCamera();
  if (!e.repeat && e.code === "Escape" && state.driving)
    openDialog("pause-dialog");
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  clearInput();
  if (state.driving && !document.querySelector("dialog[open]"))
    openDialog("pause-dialog");
});
document.addEventListener("visibilitychange", () => {
  clearInput();
  ambience.visibility(document.hidden);
  if (
    document.hidden &&
    state.driving &&
    !document.querySelector("dialog[open]")
  )
    openDialog("pause-dialog");
});
for (const button of document.querySelectorAll("[data-key]")) {
  const key = button.dataset.key;
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    touch.add(key);
    state.cruise = false;
    updateCruise();
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    button.addEventListener(event, () => touch.delete(key));
}
$("sound").addEventListener("click", async () => {
  try {
    const active = await ambience.setEnabled(!ambience.enabled);
    $("sound").setAttribute("aria-pressed", String(active));
    document.querySelector(".sound-label").textContent = active
      ? "水声开启"
      : "声音关闭";
  } catch (error) {
    toast("声音暂时无法播放，请再试一次");
  }
});
function mood(name) {
  if (!environment) return;
  state.mood = name;
  const preset = environment.setMood(name);
  water.setMood({ ...preset, name });
  renderer.toneMappingExposure = preset.exposure ?? 1.0;
  document.querySelectorAll("[data-mood]").forEach((button) => {
    const active = button.dataset.mood === name;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("mood-name").textContent = name === "dawn" ? "晨雾水道" : "月光水道";
  $("weather").textContent = name === "dawn" ? "晨雾 · 微风" : "薄云 · 静水";
  $("clock").textContent = name === "dawn" ? "05:42" : "22:16";
}
document
  .querySelectorAll("[data-mood]")
  .forEach((button) =>
    button.addEventListener("click", () => mood(button.dataset.mood)),
  );
const desiredPosition = new THREE.Vector3(),
  desiredTarget = new THREE.Vector3(),
  lookTarget = new THREE.Vector3();
function cameraPose() {
  const portrait = innerWidth < 700,
    h = boat.heading;
  if (!state.driving) {
    desiredPosition.set(
      boat.x + (portrait ? 0 : 5),
      portrait ? 4.1 : 3.8,
      boat.z + (portrait ? 17 : 18),
    );
    desiredTarget.set(
      boat.x - (portrait ? 0 : 10),
      portrait ? 1.4 : 1.35,
      boat.z - 16,
    );
  } else {
    const angle = h + (state.camera === "scenic" ? 0.7 : 0),
      distance = portrait ? 11 : 9.8;
    desiredPosition.set(
      boat.x + Math.sin(angle) * distance,
      3.0 + (state.camera === "scenic" ? 1.1 : 0),
      boat.z + Math.cos(angle) * distance,
    );
    desiredTarget.set(boat.x - Math.sin(h) * 8, 1.2, boat.z - Math.cos(h) * 8);
  }
}
function snapCamera() {
  cameraPose();
  camera.position.copy(desiredPosition);
  lookTarget.copy(desiredTarget);
  camera.lookAt(lookTarget);
}
function resize() {
  if (!renderer) return;
  const w = innerWidth,
    h = innerHeight;
  if (state.driving)
    $("touch-controls").hidden = !(
      navigator.maxTouchPoints > 0 ||
      matchMedia("(any-pointer:coarse)").matches ||
      w < 700
    );
  renderer.setPixelRatio(
    pixelRatio(w, h, { maxPixels: 1800000, maxDpr: 1.75 }),
  );
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < 700 ? 54 : 46;
  camera.updateProjectionMatrix();
  water?.resize(w, h);
  composer?.setPixelRatio(renderer.getPixelRatio());
  composer?.setSize(w, h);
}
window.addEventListener("resize", resize);
async function credits() {
  const response = await fetch(url("asset-manifest.json"));
  if (!response.ok) throw new Error("素材来源清单未能载入");
  const data = await response.json();
  const assets = Array.isArray(data) ? data : data.assets || [];
  debug.assets = assets;
  const list = $("credits-list");
  list.replaceChildren();
  for (const asset of assets) {
    const row = document.createElement("div");
    row.className = "credit-row";
    const info = document.createElement("div"),
      title = document.createElement("h3"),
      tag = document.createElement("a"),
      by = document.createElement("p"),
      link = document.createElement("a");
    title.textContent = asset.name || asset.title;
    tag.className = "license-tag";
    tag.textContent = asset.license;
    tag.href = asset.licenseUrl;
    tag.target = "_blank";
    tag.rel = "noopener noreferrer";
    title.append(tag);
    by.textContent =
      (asset.author || "") +
      (asset.description ? " · " + asset.description : "");
    info.append(title, by);
    link.href = asset.source || asset.sourceUrl;
    link.textContent = "原始素材 ↗";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    row.append(info, link);
    list.append(row);
  }
}
async function init() {
  renderer = new THREE.WebGLRenderer({
    canvas: $("world"),
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    46,
    innerWidth / innerHeight,
    0.15,
    1400,
  );
  water = createWater(scene);
  wake = createWake(scene);
  water.exclude(wake.mesh);
  resize();
  snapCamera();
  debug.renderer = renderer;
  debug.scene = scene;
  debug.camera = camera;
  debug.water = water;
  const results = await Promise.all([
    createEnvironment(scene, {
      renderer,
      quality: innerWidth < 700 ? "low" : "balanced",
      assets: {
        treeUrl: url("island-tree.glb"),
        deadTreeUrl: url("dead-tree.glb"),
        fernUrl: url("fern.glb"),
      },
    }),
    createSwampBoat(scene, new URL("../assets/library/futuristic-speedboat/model.glb", document.baseURI).href),
    credits(),
  ]);
  [environment, boatVisual] = results;
  if (environment.warnings?.length)
    throw new Error(environment.warnings.join("; "));
  debug.environment = environment;
  debug.boatVisual = boatVisual;
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    0.14,
    0.45,
    1.05,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  mood("moonlight");
  resize();
  boatVisual.update(0, 0, boat);
  environment.update(0, 0, boat);
  snapCamera();
  state.ready = true;
  $("loading").hidden = true;
  $("start").disabled = $("tour").disabled = false;
  $("start").innerHTML = '开始航行 <span aria-hidden="true">↗</span>';
  let last = performance.now(),
    frame = 0;
  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (document.hidden) return;
    if (!state.paused) {
      state.elapsed += dt;
      if (state.driving) {
        const throttle =
          (keys.has("KeyW") || keys.has("ArrowUp") || touch.has("forward")
            ? 1
            : 0) -
          (keys.has("KeyS") || keys.has("ArrowDown") || touch.has("reverse")
            ? 1
            : 0);
        const steer =
          (keys.has("KeyA") || keys.has("ArrowLeft") || touch.has("left")
            ? 1
            : 0) -
          (keys.has("KeyD") || keys.has("ArrowRight") || touch.has("right")
            ? 1
            : 0);
        stepNavigation(
          boat,
          {
            throttle: keys.has("Space") ? 0 : throttle,
            steer,
            cruise: state.cruise,
          },
          dt,
        );
      }
      boatVisual.update(dt, state.elapsed, boat);
      environment.update(dt, state.elapsed, boat);
      water.update(state.elapsed, boat);
      wake.update(dt, state.elapsed, boat);
      cameraPose();
      camera.position.lerp(desiredPosition, 1 - Math.exp(-dt * 2.6));
      lookTarget.lerp(desiredTarget, 1 - Math.exp(-dt * 3));
      camera.lookAt(lookTarget);
    }
    if (frame++ % 12 === 0) {
      $("speed").textContent = (Math.abs(boat.speed) * 3.6).toFixed(1);
      $("distance").textContent = String(Math.round(boat.distance)).padStart(
        3,
        "0",
      );
      const region =
        boat.z > 10 ? "月光水道" : boat.z > -100 ? "林影深处" : "苇荡回湾";
      $("place-name").textContent = region;
      $("journey-note").textContent = state.cruise
        ? "正在巡航 · 方向键随时接管"
        : "循着水道，慢慢向前。";
    }
    renderer.info.reset();
    composer.render();
  }
  requestAnimationFrame(animate);
}
init().catch((error) => {
  console.error(error);
  errors.push(String(error));
  $("load-text").textContent = "场景未能准备完成，请重新载入。";
  $("retry").hidden = false;
  document.querySelector(".loader").hidden = true;
});
