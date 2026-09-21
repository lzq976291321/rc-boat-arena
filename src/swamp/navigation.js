// Calm, frame-rate-independent swamp navigation; no rendering dependencies.
// heading = 0 faces -Z. Positive steering turns left; reverse steering reverses the bow.
const MIN_Z = -230;
const MAX_Z = 90;
const HALF_CHANNEL = 15;
const MAX_FORWARD_SPEED = 5;
const MAX_REVERSE_SPEED = 1.5;
const TURN_MARGIN = 22;
const MAX_FRAME_DT = 0.05;
const INTEGRATION_DT = 1 / 120;

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const smooth = (current, target, rate, dt) =>
  target + (current - target) * Math.exp(-rate * dt);
const wrapAngle = (value) => Math.atan2(Math.sin(value), Math.cos(value));
const inputValue = (value) =>
  Number.isFinite(value) ? clamp(value, -1, 1) : 0;

export function riverCenter(z) {
  return Math.sin(z * 0.018) * 12 + Math.sin(z * 0.045) * 3;
}

function riverSlope(z) {
  return Math.cos(z * 0.018) * 0.216 + Math.cos(z * 0.045) * 0.135;
}

export function createNavigation() {
  return {
    x: riverCenter(65),
    z: 65,
    heading: 0,
    speed: 0,
    distance: 0,
    throttle: 0,
    turnRate: 0,
    _cruising: false,
    _cruiseDirection: -1,
    _turning: false,
    _turnSide: 1,
  };
}

export function resetNavigation(state) {
  Object.assign(state, createNavigation());
  return state;
}

function cruiseCommand(state) {
  if (!state._cruising) {
    // Resume in the direction the bow currently faces instead of snapping to a preset heading.
    state._cruiseDirection = Math.cos(state.heading) >= 0 ? -1 : 1;
    state._turning = false;
    state._cruising = true;
  }
  const direction = state._cruiseDirection;
  if (
    !state._turning &&
    ((direction < 0 && state.z <= MIN_Z + TURN_MARGIN) ||
      (direction > 0 && state.z >= MAX_Z - TURN_MARGIN))
  ) {
    const lateral = state.x - riverCenter(state.z);
    state._turnSide =
      Math.abs(lateral) > 1 ? -Math.sign(lateral) * direction : 1;
    state._cruiseDirection = -direction;
    state._turning = true;
  }

  const lookahead = 9 + Math.abs(state.speed) * 1.8;
  const targetZ = clamp(
    state.z + state._cruiseDirection * lookahead,
    MIN_Z + 8,
    MAX_Z - 8,
  );
  const targetX = riverCenter(targetZ);
  const desired = Math.atan2(-(targetX - state.x), -(targetZ - state.z));
  let error = wrapAngle(desired - state.heading);
  if (state._turning && Math.abs(error) < 0.3) state._turning = false;
  if (state._turning && Math.sign(error) !== state._turnSide)
    error += state._turnSide * Math.PI * 2;

  const steer = clamp(error * 1.55, -1, 1);
  // Slow before the end of a channel and through the turn, retaining steerage throughout.
  const clearance =
    state._cruiseDirection < 0 ? state.z - MIN_Z : MAX_Z - state.z;
  const gentleCorner = 1 - Math.min(1, Math.abs(error) / 1.1);
  const throttle = state._turning
    ? 0.38
    : Math.min(
        0.7 + gentleCorner * 0.1,
        clearance < TURN_MARGIN + 12 ? 0.5 : 1,
      );
  return { throttle, steer };
}

function integrate(state, command, dt) {
  const { throttle, steer } = command;
  state.throttle = smooth(state.throttle, throttle, 4, dt);
  const targetSpeed =
    state.throttle *
    (state.throttle < 0 ? MAX_REVERSE_SPEED : MAX_FORWARD_SPEED);
  const braking = state.speed * throttle < 0;
  const accelerationRate = braking
    ? 2.8
    : Math.abs(throttle) > 0.001
      ? 0.9
      : 0.42;
  state.speed = clamp(
    smooth(state.speed, targetSpeed, accelerationRate, dt),
    -MAX_REVERSE_SPEED,
    MAX_FORWARD_SPEED,
  );

  const steerage = clamp(Math.abs(state.speed) / 1.4, 0, 1);
  const reverse = state.speed < -0.05 ? -1 : 1;
  const targetTurn = steer * 0.95 * steerage * reverse;
  const oldTurn = state.turnRate;
  state.turnRate = smooth(state.turnRate, targetTurn, 5, dt);
  state.heading += (oldTurn + state.turnRate) * 0.5 * dt;

  const oldX = state.x,
    oldZ = state.z;
  let dx = -Math.sin(state.heading) * state.speed * dt;
  let dz = -Math.cos(state.heading) * state.speed * dt;
  let x = oldX + dx,
    z = oldZ + dz;
  let contact = z < MIN_Z || z > MAX_Z;
  z = clamp(z, MIN_Z, MAX_Z);
  const lateral = x - riverCenter(z);
  if (Math.abs(lateral) > HALF_CHANNEL) {
    contact = true;
    const side = Math.sign(lateral);
    const slope = riverSlope(z),
      length = Math.hypot(1, slope);
    const normalX = side / length,
      normalZ = (-side * slope) / length;
    const outward = dx * normalX + dz * normalZ;
    if (outward > 0) {
      dx -= outward * normalX;
      dz -= outward * normalZ;
      x = oldX + dx;
      z = clamp(oldZ + dz, MIN_Z, MAX_Z);
    }
    x = clamp(x, riverCenter(z) - HALF_CHANNEL, riverCenter(z) + HALF_CHANNEL);
  }
  if (contact) state.speed *= Math.exp(-2.4 * dt);
  state.x = x;
  state.z = z;
  state.distance += Math.hypot(x - oldX, z - oldZ);
}

/** Mutates and returns state. Long suspended frames advance at most 50 ms. */
export function stepNavigation(
  state,
  { throttle = 0, steer = 0, cruise = false } = {},
  dt = 0,
) {
  if (!Number.isFinite(dt) || dt <= 0) return state;
  let remaining = Math.min(dt, MAX_FRAME_DT);
  const manual = { throttle: inputValue(throttle), steer: inputValue(steer) };
  if (!cruise) {
    state._cruising = false;
    state._turning = false;
  }
  while (remaining > 1e-9) {
    const step = Math.min(remaining, INTEGRATION_DT);
    integrate(state, cruise ? cruiseCommand(state) : manual, step);
    remaining -= step;
  }
  return state;
}
