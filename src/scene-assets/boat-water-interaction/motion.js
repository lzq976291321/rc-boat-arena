// Metres, seconds and radians. Heading 0 faces -Z; positive yaw turns left.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const flatSurface = () => ({ height: 0, slopeX: 0, slopeZ: 0 });

/** Four buoyancy points drive a quiet, critically damped hull attitude.
 * The caller owns navigation and the surface sampler. Heave is the waterline's
 * world Y; the visual mount continues to own its separate keel/draft offset.
 */
export function createHullMotion({ length = 2.4, beam = .738, draft = .11,
  sampleSurface = flatSurface } = {}) {
  if (![length, beam].every(value => Number.isFinite(value) && value > 0)
    || !Number.isFinite(draft) || draft < 0 || draft > length * .3)
    throw new TypeError('Hull motion requires positive dimensions and a valid draft');
  if (typeof sampleSurface !== 'function') throw new TypeError('Hull motion requires a surface sampler');
  let sample = sampleSurface, previous = null, previousTime = 0, acceleration = 0, disposed = false;
  const pose = { heave: 0, pitch: 0, roll: 0 };
  const velocity = { heave: 0, pitch: 0, roll: 0 };
  const target = { ...pose };
  const halfLength = length * .34, halfBeam = beam * .42;
  const response = Math.sqrt(2.4 / length) * clamp(Math.sqrt(.11 / Math.max(draft, .04)), .8, 1.2);
  const frequencies = { heave: 8 * response, pitch: 6 * response, roll: 7 * response };

  function input(boat) {
    return {
      x: finite(boat?.x, previous?.x ?? 0), z: finite(boat?.z, previous?.z ?? 0),
      heading: finite(boat?.heading, previous?.heading ?? 0),
      speed: clamp(finite(boat?.speed), 0, 30),
      turnRate: clamp(finite(boat?.turnRate), -8, 8),
    };
  }

  function buoyancy(time, boat) {
    const sin = Math.sin(boat.heading), cos = Math.cos(boat.heading);
    let mean = 0, along = 0, across = 0;
    for (const forward of [-1, 1]) for (const right of [-1, 1]) {
      const x = boat.x - sin * halfLength * forward + cos * halfBeam * right;
      const z = boat.z - cos * halfLength * forward - sin * halfBeam * right;
      const height = finite(sample(x, z, time)?.height);
      mean += height * .25;
      along += height * forward * .25;
      across += height * right * .25;
    }
    // Fit the supporting plane across the hull footprint. Point normals alone
    // would make a metre-scale hull react to every tiny shader ripple.
    target.heave = mean;
    const trim = .011 * Math.tanh((boat.speed / 1.2) ** 2)
      + .009 * Math.tanh(acceleration / .75);
    target.pitch = clamp(Math.atan(along / halfLength) + trim, -.055, .055);
    // Positive turnRate turns toward -X: starboard rises while port leans in.
    const bank = Math.atan2(boat.speed * boat.turnRate, 9.81) * .22;
    target.roll = clamp(Math.atan(across / halfBeam) + bank, -.075, .075);
  }

  function spring(dt) {
    for (const axis of ['heave', 'pitch', 'roll']) {
      const omega = frequencies[axis], decay = Math.exp(-omega * dt);
      const offset = pose[axis] - target[axis], combined = velocity[axis] + omega * offset;
      // Exact critically damped step for this target; no unstable Euler spring.
      pose[axis] = target[axis] + (offset + combined * dt) * decay;
      velocity[axis] = (velocity[axis] - omega * combined * dt) * decay;
    }
  }

  function reset(time = 0, boat = {}) {
    if (disposed) return pose;
    // Reset input fallbacks must not depend on any earlier navigation state.
    previous = null;
    const next = input(boat);
    previousTime = finite(time); acceleration = 0;
    buoyancy(previousTime, next);
    for (const axis of ['heave', 'pitch', 'roll']) { pose[axis] = target[axis]; velocity[axis] = 0; }
    previous = next;
    return pose;
  }

  function update(dt, time, boat) {
    if (disposed || !Number.isFinite(dt) || dt <= 0) return pose;
    const step = Math.min(dt, .1), next = input(boat), now = finite(time, previousTime + step);
    if (!previous) return reset(now, next);
    const distance = Math.hypot(next.x - previous.x, next.z - previous.z);
    const jumpLimit = Math.max(length * 1.5, (next.speed + previous.speed) * step * 2 + beam);
    if (distance > jumpLimit || now < previousTime - 1e-6
      || Math.abs(now - previousTime - step) > .25) return reset(now, next);
    const rawAcceleration = clamp((next.speed - previous.speed) / step, -2, 2);
    const steps = Math.max(1, Math.ceil(step * 120 - 1e-9)), substep = step / steps;
    const headingChange = angleDelta(previous.heading, next.heading);
    for (let i = 1; i <= steps; i++) {
      const fraction = i / steps;
      const interpolated = {
        x: previous.x + (next.x - previous.x) * fraction,
        z: previous.z + (next.z - previous.z) * fraction,
        heading: previous.heading + headingChange * fraction,
        speed: previous.speed + (next.speed - previous.speed) * fraction,
        turnRate: previous.turnRate + (next.turnRate - previous.turnRate) * fraction,
      };
      acceleration += (rawAcceleration - acceleration) * (1 - Math.exp(-substep / .24));
      buoyancy(previousTime + (now - previousTime) * fraction, interpolated);
      spring(substep);
    }
    previous = next; previousTime = now;
    return pose;
  }

  return {
    pose, update, reset,
    snapshot: () => ({ ...pose, velocity: { ...velocity }, target: { ...target },
      acceleration, time: previousTime, dimensions: { length, beam, draft }, disposed }),
    dispose() {
      if (disposed) return;
      disposed = true; sample = null; previous = null;
      // No ownership of the caller's sampler or another hull's state.
    },
  };
}
