export const WAKE_CAPACITY = 40;
export const WAKE_LIFETIME = 12;

const finiteFloat = value => Number.isFinite(value) && Number.isFinite(Math.fround(value));
const FLOAT_MAX = 3.4028234663852886e38;

// Updates with an invalid position/orientation are ignored. Reset instead fills
// missing/invalid fields from the origin. Speeds are nonnegative metres/second;
// finite bounds match hull motion and keep the GPU buffers free of infinities.
export function normalizeBoatState(boat, reset = false) {
  if (!reset && (!boat || !finiteFloat(boat.x) || !finiteFloat(boat.z) || !Number.isFinite(boat.heading))) return null;
  const heading = Number.isFinite(boat?.heading) ? boat.heading : 0;
  return {
    x: finiteFloat(boat?.x) ? boat.x : 0,
    z: finiteFloat(boat?.z) ? boat.z : 0,
    heading: Math.atan2(Math.sin(heading), Math.cos(heading)),
    speed: Number.isFinite(boat?.speed) ? Math.max(0, Math.min(30, boat.speed)) : 0,
    turnRate: Number.isFinite(boat?.turnRate) ? Math.max(-8, Math.min(8, boat.turnRate)) : 0,
  };
}

// A finite world-space history. Nothing is reattached to the boat on a turn.
export function createWakeHistory({ length = 2.4, sternOffset = .4, wakeStrength = 1 } = {}) {
  if (!finiteFloat(length) || Math.fround(length) <= 0) throw new TypeError('Wake length must be positive and fit a GPU float');
  if (!Number.isFinite(sternOffset) || sternOffset < .2 || sternOffset > .6
    || !Number.isFinite(wakeStrength) || wakeStrength < 0 || wakeStrength > 2)
    throw new TypeError('Wake shape must stay within the supported hull envelope');
  const points = new Float32Array(WAKE_CAPACITY * 4);
  const bounds = new Float32Array([1, 1, -1, -1]);
  const samples = [];
  let previous, distance = 0, disposed = false;
  function clear() { samples.length = 0; points.fill(0); bounds.set([1, 1, -1, -1]); previous = undefined; distance = 0; }
  function update(dt, time, boat) {
    if (disposed || !Number.isFinite(dt) || dt <= 0 || !Number.isFinite(time)) return;
    const state = normalizeBoatState(boat);
    if (!state) return;
    const { speed } = state;
    const x = state.x + Math.sin(state.heading) * length * sternOffset;
    const z = state.z + Math.cos(state.heading) * length * sternOffset;
    if (!finiteFloat(x) || !finiteFloat(z)) return;
    if (previous && (time < previous.time || Math.hypot(x - previous.x, z - previous.z) > length)) clear();
    if (previous) distance += Math.hypot(x - previous.x, z - previous.z);
    const strength = Math.min(1, speed / .85) * wakeStrength;
    // Keep enough temporal coverage for the oldest waves to fade before the
    // finite buffer drops them, even when a turn moves the stern faster.
    const gap = samples.length ? time - samples[0].time : Infinity;
    if (speed > .025 && (!samples.length || (gap >= WAKE_LIFETIME / (WAKE_CAPACITY - 2)
      && (distance >= length * .07 || gap >= .45)))) {
      samples.unshift({ x, z, time, strength }); distance = 0;
    }
    while (samples.length > WAKE_CAPACITY || (samples.length && time - samples.at(-1).time >= WAKE_LIFETIME)) samples.pop();
    points.fill(0);
    bounds.set([Infinity, Infinity, -Infinity, -Infinity]);
    for (let i = 0; i < samples.length; i++) {
      const point = samples[i], offset = i * 4;
      points[offset] = point.x; points[offset + 1] = point.z;
      points[offset + 2] = Math.max(0, time - point.time); points[offset + 3] = point.strength;
      bounds[0] = Math.min(bounds[0], point.x); bounds[1] = Math.min(bounds[1], point.z);
      bounds[2] = Math.max(bounds[2], point.x); bounds[3] = Math.max(bounds[3], point.z);
    }
    if (samples.length) {
      const margin = length * .16 + WAKE_LIFETIME * .17 + .65;
      bounds[0] = Math.max(-FLOAT_MAX, bounds[0] - margin); bounds[1] = Math.max(-FLOAT_MAX, bounds[1] - margin);
      bounds[2] = Math.min(FLOAT_MAX, bounds[2] + margin); bounds[3] = Math.min(FLOAT_MAX, bounds[3] + margin);
    } else bounds.set([1, 1, -1, -1]);
    previous = { x, z, time };
  }
  return { points, bounds, update, reset() { if (!disposed) clear(); },
    get count() { return samples.length; },
    snapshot: () => ({ count: samples.length, capacity: WAKE_CAPACITY, lifetime: WAKE_LIFETIME, disposed }),
    dispose() { if (disposed) return; clear(); disposed = true; },
  };
}
