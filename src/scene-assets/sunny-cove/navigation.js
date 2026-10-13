// One scene unit is one metre. Zero heading faces -Z; positive turns toward -X.
// Cubic segments share positions and tangent directions. Arc-length lookup keeps
// travel smooth even where segment lengths differ; a single clock owns the loop.
export const COVE_ROUTE = Object.freeze([
  [[-5, 3.5], [-2, 3.5], [2, 3.8], [3.8, 3.8]],
  [[3.8, 3.8], [7, 3.8], [7.6, 0.5], [7.6, -3.5]],
  [[7.6, -3.5], [7.6, -8], [5, -10.3], [1, -10.3]],
  [[1, -10.3], [-3, -10.3], [-0.3, -8], [-0.3, -4]],
  [[-0.3, -4], [-0.3, -0.5], [-0.3, 2.2], [-0.3, 3.4]],
  [[-0.3, 3.4], [-0.3, 6], [-4.5, 6], [-6, 6]],
  [[-6, 6], [-8.1, 6], [-8.1, 3.5], [-6.8, 3.5]],
  [[-6.8, 3.5], [-6.2, 3.5], [-5.5, 3.5], [-5, 3.5]],
].map(segment => Object.freeze(segment.map(point => Object.freeze(point)))));

const configurations = new WeakMap();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const ease = value => value * value * (3 - 2 * value);

function curve(segment, u) {
  const [a, b, c, d] = segment, v = 1 - u;
  const x = v ** 3 * a[0] + 3 * v * v * u * b[0] + 3 * v * u * u * c[0] + u ** 3 * d[0];
  const z = v ** 3 * a[1] + 3 * v * v * u * b[1] + 3 * v * u * u * c[1] + u ** 3 * d[1];
  const dx = 3 * v * v * (b[0] - a[0]) + 6 * v * u * (c[0] - b[0]) + 3 * u * u * (d[0] - c[0]);
  const dz = 3 * v * v * (b[1] - a[1]) + 6 * v * u * (c[1] - b[1]) + 3 * u * u * (d[1] - c[1]);
  return { x, z, heading: Math.atan2(-dx, -dz) };
}

function buildRoute(route) {
  if (!Array.isArray(route) || !route.length) throw new TypeError("Cove route requires cubic segments");
  const segments = route.map(segment => {
    if (segment.length !== 4 || segment.some(point => point.length !== 2 || !point.every(Number.isFinite)))
      throw new TypeError("Each route segment requires four finite [x, z] points");
    return segment.map(point => [...point]);
  });
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i], following = segments[(i + 1) % segments.length];
    const end = segment[3], next = following[0];
    if (Math.hypot(end[0] - next[0], end[1] - next[1]) > 1e-6)
      throw new Error("Cove route must form a continuous closed loop");
    const incoming = Math.atan2(end[1] - segment[2][1], end[0] - segment[2][0]);
    const outgoing = Math.atan2(following[1][1] - next[1], following[1][0] - next[0]);
    if (Math.abs(angleDelta(incoming, outgoing)) > 1e-6)
      throw new Error("Cove route segments must share a smooth tangent");
  }
  const samples = [{ distance: 0, segment: 0, u: 0 }];
  let previous = curve(segments[0], 0), length = 0;
  for (let segment = 0; segment < segments.length; segment++) {
    for (let i = 1; i <= 100; i++) {
      const u = i / 100, point = curve(segments[segment], u);
      length += Math.hypot(point.x - previous.x, point.z - previous.z);
      samples.push({ distance: length, segment, u });
      previous = point;
    }
  }
  if (length < 1e-6) throw new Error("Cove route has no travel distance");
  return { segments, samples, length };
}

function along(path, distance) {
  const { samples, segments } = path;
  if (distance <= 0) return curve(segments[0], 0);
  if (distance >= path.length) return curve(segments.at(-1), 1);
  let low = 0, high = samples.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (samples[mid].distance < distance) low = mid;
    else high = mid;
  }
  const before = samples[low], after = samples[high];
  const t = (distance - before.distance) / (after.distance - before.distance);
  const startU = before.segment === after.segment ? before.u : 0;
  return curve(segments[after.segment], startU + (after.u - startU) * t);
}

function apply(state, configuration, dt = 0) {
  const { clock, path, travelDuration, dwellDuration } = configuration;
  const duration = travelDuration + dwellDuration;
  const cycle = Math.floor(clock / duration), cycleTime = clock - cycle * duration;
  const parked = cycleTime >= travelDuration;
  const progress = clamp(cycleTime / travelDuration, 0, 1);
  const travelled = ease(progress) * path.length;
  const point = along(path, travelled);
  const turn = dt > 0 ? angleDelta(state.heading, point.heading) : 0;
  state.x = point.x; state.z = point.z;
  state.heading = dt > 0 ? state.heading + turn : point.heading;
  state.speed = parked ? 0 : path.length * 6 * progress * (1 - progress) / travelDuration;
  state.turnRate = dt > 0 ? turn / dt : 0;
  state.phase = parked ? "docked" : progress < 0.15 ? "departing" : progress > 0.8 ? "approaching" : "cruising";
  state.progress = progress;
  state.cycle = cycle;
  state.cycleTime = cycleTime;
  state.distance = cycle * path.length + travelled - configuration.startDistance;
  return state;
}

/**
 * Defaults to a foreground pass, then travels and moors for 18 s each 108 s.
 * route is a closed list of cubic [start, handle, handle, end] segments in XZ.
 * Callers adapting the route must retain clearance for their hull and scenery.
 */
export function createCoveNavigation({ route = COVE_ROUTE, travelDuration = 90,
  dwellDuration = 18, startProgress = 0.2 } = {}) {
  const path = buildRoute(route);
  const travel = Math.max(10, finite(travelDuration, 90));
  const start = clamp(finite(startProgress, 0.2), 0, 1);
  const configuration = {
    path, travelDuration: travel, dwellDuration: Math.max(0, finite(dwellDuration, 18)),
    start, clock: travel * start, startDistance: ease(start) * path.length,
  };
  const state = { x: 0, z: 0, heading: 0, speed: 0, turnRate: 0, elapsed: 0, phase: "cruising" };
  configurations.set(state, configuration);
  return apply(state, configuration);
}

export function stepCoveNavigation(state, dt = 0) {
  const configuration = configurations.get(state);
  if (!configuration) throw new TypeError("Use createCoveNavigation to create boat state");
  if (!Number.isFinite(dt) || dt <= 0) return state;
  const step = Math.min(dt, 0.05);
  configuration.clock += step;
  state.elapsed += step;
  return apply(state, configuration, step);
}

export function resetCoveNavigation(state, { atBerth = false, dwellDuration } = {}) {
  const configuration = configurations.get(state);
  if (!configuration) throw new TypeError("Use createCoveNavigation to create boat state");
  // A new selected hull rests in the berth before its first departure. Keep
  // the authored route and the same state object for existing consumers.
  configuration.clock = atBerth
    ? configuration.travelDuration + configuration.dwellDuration
      - clamp(finite(dwellDuration, configuration.dwellDuration), 0, configuration.dwellDuration)
    : configuration.travelDuration * configuration.start;
  state.elapsed = 0;
  return apply(state, configuration);
}
