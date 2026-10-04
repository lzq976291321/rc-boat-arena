import { Vector3 } from "three";

export const CAMERA_MODES = Object.freeze([
  Object.freeze({ id: "auto", label: "自动观赏" }),
  Object.freeze({ id: "follow", label: "贴水跟随" }),
  Object.freeze({ id: "scenic", label: "侧览船模" }),
  Object.freeze({ id: "overview", label: "水道全景" }),
]);

const SHOTS = ["follow", "scenic", "overview"];
const DEFAULT_PRESETS = {
  follow: { distance: 12.2, side: 0, height: 2.8, lookAhead: 1.8, targetHeight: 0.8, fov: 46 },
  scenic: { distance: 10, side: 7.5, height: 3.8, lookAhead: 0.7, targetHeight: 0.8, fov: 43 },
  overview: { distance: 20, side: 2.5, height: 14, lookAhead: 3, targetHeight: 0.6, fov: 48 },
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const smoothstep = (value) => value * value * (3 - 2 * value);
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * A camera-only asset: the caller owns the camera, animation loop and lifetime.
 * Coordinates follow boat heading: zero faces -Z; positive turns toward -X.
 * riverCenter(z) and riverHalfWidth (number or function of z) define safe water.
 * Presets use scene units. Automatic shots hold for 22 s and blend for 12 s.
 * time is accepted for the common scene-asset update interface; elapsed dt owns
 * the sequence so a hidden tab or a host clock reset cannot skip between shots.
 */
export function createViewingCamera(camera, {
  riverCenter = () => 0,
  riverHalfWidth = 18,
  reducedMotion = false,
  presets = {},
  holdDuration = 22,
  transitionDuration = 12,
  bankMargin = 3,
} = {}) {
  if (!camera?.isPerspectiveCamera) throw new TypeError("A PerspectiveCamera is required");
  const shots = Object.fromEntries(SHOTS.map((id) => {
    const defaults = DEFAULT_PRESETS[id];
    return [id, Object.fromEntries(Object.entries(defaults).map(([key, value]) =>
      [key, finite(presets[id]?.[key], value)]))];
  }));
  const hold = Math.max(1, finite(holdDuration, 22));
  const transition = Math.max(2, finite(transitionDuration, 12));
  const margin = Math.max(3, finite(bankMargin, 3));
  const centerAt = (z) => finite(typeof riverCenter === "function" ? riverCenter(z) : riverCenter, 0);
  const widthAt = (z) => Math.max(0, finite(typeof riverHalfWidth === "function" ? riverHalfWidth(z) : riverHalfWidth, 18));
  const position = new Vector3();
  const target = new Vector3();
  const desiredPosition = new Vector3();
  const desiredTarget = new Vector3();
  const blended = {};
  let mode = reducedMotion ? "follow" : "auto";
  let activeMode = "follow";
  let nextMode = "follow";
  let blend = 0;
  let elapsed = 0;
  let heading = 0;
  let fov = shots.follow.fov;
  let initialized = false;
  let disposed = false;

  function constrain(vector) {
    const center = centerAt(vector.z);
    const radius = Math.max(0, widthAt(vector.z) - margin);
    vector.x = clamp(vector.x, center - radius, center + radius);
    vector.y = Math.max(1.2, vector.y);
    return vector;
  }

  function frame() {
    if (mode === "auto") {
      const duration = hold + transition;
      const cycle = elapsed % (duration * SHOTS.length);
      const index = Math.floor(cycle / duration);
      const progress = cycle % duration;
      activeMode = SHOTS[index];
      nextMode = SHOTS[(index + 1) % SHOTS.length];
      blend = smoothstep(clamp((progress - hold) / transition, 0, 1));
    } else {
      activeMode = nextMode = mode;
      blend = 0;
    }
    for (const key of Object.keys(DEFAULT_PRESETS.follow)) {
      blended[key] = shots[activeMode][key] + (shots[nextMode][key] - shots[activeMode][key]) * blend;
    }
    // More vertical field of view and slightly more distance preserve the hull
    // in portrait without sending a side camera into the bank.
    const aspect = Math.max(0.2, finite(camera.aspect, 1));
    const portrait = clamp((1 - aspect) / 0.5, 0, 1);
    return { distanceScale: 1 + portrait * 0.28, sideScale: 1 - portrait * 0.24, fovOffset: portrait * 7 };
  }

  function pose(boat) {
    const framing = frame();
    const x = finite(boat?.x, 0), z = finite(boat?.z, 0);
    const sin = Math.sin(heading), cos = Math.cos(heading);
    const distance = Math.max(5, blended.distance) * framing.distanceScale;
    const side = blended.side * framing.sideScale;
    desiredPosition.set(x + sin * distance + cos * side, Math.max(1.2, blended.height), z + cos * distance - sin * side);
    constrain(desiredPosition);
    desiredTarget.set(x - sin * blended.lookAhead, blended.targetHeight, z - cos * blended.lookAhead);
    return clamp(blended.fov + framing.fovOffset, 30, 65);
  }

  function apply() {
    camera.position.copy(position);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    if (Math.abs(camera.fov - fov) > 0.0001) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  function snap(boat) {
    if (disposed) return;
    heading = finite(boat?.heading, 0);
    fov = pose(boat);
    position.copy(desiredPosition);
    target.copy(desiredTarget);
    initialized = true;
    apply();
  }

  return {
    setMode(value) {
      if (disposed || !CAMERA_MODES.some(({ id }) => id === value)) return mode;
      if (value === "auto" && mode !== "auto") {
        // Resume from the selected shot instead of orbiting back to follow.
        elapsed = Math.max(0, SHOTS.indexOf(mode)) * (hold + transition);
      }
      mode = value;
      return mode;
    },
    update(dt, time, boat) {
      if (disposed) return;
      if (!initialized) snap(boat);
      if (!Number.isFinite(dt) || dt <= 0) return;
      const step = Math.min(dt, 0.1);
      if (mode === "auto") elapsed += step;
      // Never interpret a wrap from +PI to -PI as a full orbit. Bound angular
      // motion too, so changing a route cannot instantly whip the view around.
      const difference = angleDelta(heading, finite(boat?.heading, heading));
      heading += clamp(difference * (1 - Math.exp(-1.3 * step)), -0.5 * step, 0.5 * step);
      const nextFov = pose(boat);
      const damping = 1 - Math.exp(-1.7 * step);
      position.lerp(desiredPosition, damping);
      target.lerp(desiredTarget, 1 - Math.exp(-2.6 * step));
      // A blend between two safe positions can cross a curved bank: constrain
      // after interpolation as well as before it.
      constrain(position);
      fov += (nextFov - fov) * damping;
      apply();
    },
    snap,
    resize(width, height) {
      if (disposed || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() { disposed = true; },
    snapshot() {
      return {
        mode, activeMode, nextMode, blend, elapsed, initialized, disposed,
        position: position.toArray(), target: target.toArray(), fov,
      };
    },
  };
}
