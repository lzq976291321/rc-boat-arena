import { Vector3 } from "three";

export const CAMERA_MODES = Object.freeze([
  Object.freeze({ id: "auto", label: "自动观赏" }),
  Object.freeze({ id: "waterline", label: "船侧近观" }),
  Object.freeze({ id: "follow", label: "贴水侧跟" }),
  Object.freeze({ id: "scenic", label: "码头定机" }),
  Object.freeze({ id: "overview", label: "湾心斜览" }),
]);
const ORDER = ["waterline", "scenic", "follow", "overview"];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const smoothstep = value => value * value * (3 - 2 * value);

/** Camera-only asset: no DOM, events, RAF or GPU resources. */
export function createCoveCamera(camera, { reducedMotion = false, holdDuration = 20,
  transitionDuration = 12, presets = {}, dimensions } = {}) {
  if (!camera?.isPerspectiveCamera) throw new TypeError("A PerspectiveCamera is required");
  const shots = {
    waterline: { position: [0.55, 0.9, 4.15], target: [0, 0.18, 0], fov: 48, ...presets.waterline },
    scenic: { position: [-1.8, 2.5, 9.6], target: [-1.5, 0.15, -0.6], fov: 54, ...presets.scenic },
    follow: { position: [4.8, 2.6, 8.5], target: [0, 0.4, -1.5], fov: 47, ...presets.follow },
    overview: { position: [1.8, 6.5, 13.5], target: [0.1, 0.3, -2.5], fov: 50, ...presets.overview },
  };
  const hold = Math.max(1, finite(holdDuration, 20)), transition = Math.max(2, finite(transitionDuration, 12));
  const position = new Vector3(), target = new Vector3();
  const firstPosition = new Vector3(), firstTarget = new Vector3();
  const secondPosition = new Vector3(), secondTarget = new Vector3();
  let mode = reducedMotion ? "scenic" : "auto", activeMode = "scenic", nextMode = "scenic";
  let elapsed = 0, blend = 0, waterlineWeight = 0, fov = 50, initialized = false, disposed = false;
  let framingScale = 1, hullHeight = .563, hullDraft = .11, berthWeight = 0;
  const berthPosition = new Vector3(), berthTarget = new Vector3();
  function setBoatDimensions(value) {
    if (disposed || !value) return;
    if (![value.length, value.beam, value.height].every(number => Number.isFinite(number) && number > 0)
      || !Number.isFinite(value.draft) || value.draft < 0) throw new TypeError('Camera requires valid hull dimensions');
    framingScale = Math.max(1, value.length / 2.4, value.beam / .73821);
    hullHeight = value.height; hullDraft = value.draft;
  }
  setBoatDimensions(dimensions);

  function constrain(vector, closeWeight = 0) {
    // The close shot uses the open water behind the boat. Its wider left limit
    // is safe only in front of the pier; interpolate limits with the shot mix.
    const left = vector.z >= 3 ? -3.2 - closeWeight * 5.2 : -0.5 - closeWeight;
    vector.x = clamp(vector.x, left, 8.5 + closeWeight * .7);
    vector.y = Math.max(2.2 - closeWeight * 1.38, vector.y);
    vector.z = clamp(vector.z, -5 - closeWeight * 3, 16);
  }

  function shot(id, boat, destination, aim) {
    const preset = shots[id], x = finite(boat?.x, 0), z = finite(boat?.z, 3.5);
    destination.fromArray(preset.position); aim.fromArray(preset.target);
    const aspect = Math.max(0.2, finite(camera.aspect, 1));
    const portrait = clamp((1 - aspect) / 0.45, 0, 1);
    if (id === "waterline") {
      // A fixed compass-side offset never swings around the hull on turns.
      // Frame the initial broadside at about 45% of a desktop's width; portrait
      // retreats enough for the full boat, with slightly more space at its stern.
      const nextFov = preset.fov + portrait * 10;
      const widthFraction = .45 + portrait * .17;
      const distanceScale = clamp(1.6 / aspect * Math.tan(preset.fov * Math.PI / 360)
        / Math.tan(nextFov * Math.PI / 360) * .45 / widthFraction, .82, 3);
      destination.x = x + destination.x * distanceScale * framingScale;
      destination.y += portrait * .4 + Math.max(0, hullHeight - hullDraft - .453) * .35;
      destination.z = z + destination.z * distanceScale * framingScale;
      const heading = finite(boat?.heading, -Math.PI / 2);
      const sternBias = .32 - portrait * .16;
      aim.x += x + Math.sin(heading) * sternBias;
      aim.z += z + Math.cos(heading) * sternBias;
      aim.y += Math.max(0, hullHeight - hullDraft - .453) * .35;
      constrain(destination, 1);
      return nextFov;
    }
    if (id === "follow") {
      destination.x += x; destination.z += z;
      aim.x += x; aim.z += z;
    } else if (id === "scenic") {
      // A closer foreground pass reveals varnish, upholstery and pier joinery.
      // Gently pan and retreat at the lateral turns to retain the whole hull.
      aim.x += (x - 1) * 0.8;
      aim.z += (z - 3.7) * 0.1;
      destination.z += clamp((Math.abs(x) - 3) / 4.5, 0, 1) * clamp(z / 5, 0, 1) * 4.5;
    } else {
      // A small subject bias keeps the left foreground turn inside the fixed
      // landscape composition; no orbit follows a turning boat's heading.
      aim.x += (x - aim.x) * 0.24;
      aim.z += (z - aim.z) * 0.18;
    }
    if (portrait > 0) {
      const height = id === "overview" ? 8.5 : id === "follow" ? 3.3 : 4.2;
      const distance = id === "follow" ? 12 : 14;
      destination.x += (x + 2.8 - destination.x) * portrait;
      destination.y += (height - destination.y) * portrait;
      destination.z += (z + distance - destination.z) * portrait;
      aim.x += (x - aim.x) * portrait;
      aim.z += (z - 0.6 - aim.z) * portrait;
    }
    destination.sub(aim).multiplyScalar(framingScale).add(aim);
    constrain(destination);
    return preset.fov + portrait * 7;
  }
  function pose(boat) {
    if (mode === "auto") {
      const length = hold + transition, cycle = elapsed % (ORDER.length * length);
      const index = Math.floor(cycle / length), progress = cycle % length;
      activeMode = ORDER[index]; nextMode = ORDER[(index + 1) % ORDER.length];
      blend = smoothstep(clamp((progress - hold) / transition, 0, 1));
    } else { activeMode = nextMode = mode; blend = 0; }
    const a = shot(activeMode, boat, firstPosition, firstTarget);
    const b = shot(nextMode, boat, secondPosition, secondTarget);
    waterlineWeight = (activeMode === "waterline" ? 1 - blend : 0) + (nextMode === "waterline" ? blend : 0);
    firstPosition.lerp(secondPosition, blend); firstTarget.lerp(secondTarget, blend);
    let nextFov = a + (b - a) * blend;
    berthWeight = 0;
    if (mode === 'auto' && Number.isFinite(boat?.progress)) {
      // Arriving/departing views follow the voyage, so docking is never missed
      // merely because an unrelated camera timer selected a distant shot.
      const progress = boat.progress;
      berthWeight = boat.phase === 'docked' ? 1 : progress < .18
        ? 1 - smoothstep(clamp(progress / .18, 0, 1))
        : smoothstep(clamp((progress - .72) / .2, 0, 1));
      const berthFov = shot('scenic', boat, berthPosition, berthTarget);
      firstPosition.lerp(berthPosition, berthWeight); firstTarget.lerp(berthTarget, berthWeight);
      waterlineWeight *= 1 - berthWeight;
      nextFov += (berthFov - nextFov) * berthWeight;
    }
    return nextFov;
  }
  function apply() {
    camera.position.copy(position); camera.up.set(0, 1, 0); camera.lookAt(target);
    if (Math.abs(camera.fov - fov) > 0.0001) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
  function snap(boat) {
    if (disposed) return;
    fov = pose(boat); position.copy(firstPosition); target.copy(firstTarget); initialized = true; apply();
  }
  return {
    setBoatDimensions,
    setMode(value) {
      if (disposed || !CAMERA_MODES.some(({ id }) => id === value)) return mode;
      if (value === "auto" && mode !== "auto") elapsed = Math.max(0, ORDER.indexOf(mode)) * (hold + transition);
      mode = value; return mode;
    },
    update(dt, time, boat) {
      if (disposed) return;
      if (!initialized) snap(boat);
      if (!Number.isFinite(dt) || dt <= 0) return;
      const step = Math.min(dt, 0.05);
      if (mode === "auto") elapsed += step;
      const nextFov = pose(boat), damping = 1 - Math.exp(-2 * step);
      position.lerp(firstPosition, damping); target.lerp(firstTarget, damping);
      constrain(position, waterlineWeight); fov += (nextFov - fov) * damping; apply();
    },
    resize(width, height) {
      if (disposed || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
      camera.aspect = width / height; camera.updateProjectionMatrix();
    },
    snap,
    snapshot() { return { mode, activeMode: berthWeight > .95 ? 'scenic' : activeMode, nextMode, blend, berthWeight,
      elapsed, initialized, disposed,
      position: position.toArray(), target: target.toArray(), fov }; },
    dispose() { disposed = true; },
  };
}
