import test from "node:test";
import assert from "node:assert/strict";
import {
  riverCenter,
  createNavigation,
  stepNavigation,
  resetNavigation,
} from "../../src/swamp/navigation.js";

const run = (state, command, seconds, hz = 60) => {
  for (let i = 0; i < Math.round(seconds * hz); i++)
    stepNavigation(state, command, 1 / hz);
  return state;
};
const inside = (state) => {
  assert.ok(state.z >= -230 && state.z <= 90, `out of channel end: ${state.z}`);
  assert.ok(
    Math.abs(state.x - riverCenter(state.z)) <= 15 + 1e-9,
    "out of channel bank",
  );
  assert.ok(state.speed <= 5 && state.speed >= -1.5);
  for (const key of [
    "x",
    "z",
    "heading",
    "speed",
    "distance",
    "throttle",
    "turnRate",
  ])
    assert.ok(Number.isFinite(state[key]), `${key} is not finite`);
};

test("heading zero travels toward -Z; positive steering turns the bow left", () => {
  const neutral = run(createNavigation(), { throttle: 1 }, 2);
  assert.ok(neutral.z < 63);
  const left = { ...neutral },
    right = { ...neutral };
  run(left, { throttle: 1, steer: 1 }, 0.8);
  run(right, { throttle: 1, steer: -1 }, 0.8);
  assert.ok(left.heading > 0.3 && left.x < neutral.x - 0.5);
  assert.ok(right.heading < -0.3 && right.x > neutral.x + 0.5);
  assert.ok(Math.abs(left.speed - right.speed) < 1e-9);
});

test("reverse speed is limited and right/left rudder reverse the bow while backing", () => {
  const boat = createNavigation();
  boat.z = -20;
  boat.x = riverCenter(boat.z);
  run(boat, { throttle: -1 }, 8);
  assert.ok(boat.z > -12 && boat.speed < -1.45 && boat.speed >= -1.5);
  const left = { ...boat },
    right = { ...boat };
  run(left, { throttle: -1, steer: 1 }, 0.6);
  run(right, { throttle: -1, steer: -1 }, 0.6);
  assert.ok(left.heading < 0 && right.heading > 0);
});

test("throttle and turns build smoothly, and releasing the throttle preserves glide", () => {
  const boat = createNavigation();
  stepNavigation(boat, { throttle: 1, steer: 1 }, 1 / 60);
  assert.ok(boat.throttle > 0 && boat.throttle < 0.1);
  assert.ok(boat.speed > 0 && boat.speed < 0.1);
  assert.ok(Math.abs(boat.turnRate) < 0.01);
  run(boat, { throttle: 1 }, 2);
  const before = { ...boat };
  run(boat, {}, 0.5);
  assert.ok(boat.speed > before.speed * 0.7 && boat.speed < before.speed);
  assert.ok(boat.distance > before.distance + 0.5);
});

test("forward top speed stays below 5 m/s; invalid input and long frames do not jump", () => {
  const boat = createNavigation();
  boat.z = 40;
  boat.x = 0;
  run(boat, { throttle: 9 }, 15);
  inside(boat);
  assert.ok(boat.speed > 4.8);
  const before = { ...boat };
  stepNavigation(boat, { throttle: NaN, steer: Infinity }, 10);
  assert.ok(Math.hypot(boat.x - before.x, boat.z - before.z) <= 0.25 + 1e-9);
  assert.ok(Math.abs(boat.heading - before.heading) <= 0.048);
  const unchanged = { ...boat };
  for (const dt of [0, -1, NaN, Infinity])
    stepNavigation(boat, { cruise: true }, dt);
  assert.deepEqual(boat, unchanged);
});

test("bank contact reduces speed while allowing movement along the shore", () => {
  const boat = createNavigation();
  boat.z = -40;
  boat.x = riverCenter(boat.z) + 14.95;
  boat.heading = -Math.PI / 4;
  boat.speed = 4;
  boat.throttle = 0.8;
  const before = { ...boat };
  run(boat, { throttle: 0.8 }, 2);
  inside(boat);
  assert.ok(
    boat.z < before.z - 0.5,
    "should slide forward rather than freeze on contact",
  );
  assert.ok(
    boat.speed < before.speed * 0.7,
    "shore contact should dissipate speed",
  );
});

test("manual full-throttle collisions stay inside both channel ends and banks", () => {
  for (const heading of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
    const boat = createNavigation();
    boat.z = heading === 0 ? -229.5 : 89.5;
    boat.x = riverCenter(boat.z);
    boat.heading = heading;
    boat.speed = 5;
    for (let i = 0; i < 900; i++) {
      stepNavigation(boat, { throttle: 1 }, 1 / 60);
      inside(boat);
    }
  }
});

test("30, 60 and 144 Hz produce almost the same driven path and speed", () => {
  const tracks = [30, 60, 144].map((hz) => {
    const boat = createNavigation();
    run(boat, { throttle: 0.8 }, 2, hz);
    run(boat, { throttle: 0.8, steer: 0.28 }, 1, hz);
    run(boat, {}, 0.5, hz);
    return boat;
  });
  for (const boat of tracks.slice(1)) {
    assert.ok(Math.hypot(boat.x - tracks[0].x, boat.z - tracks[0].z) < 0.035);
    assert.ok(Math.abs(boat.heading - tracks[0].heading) < 0.005);
    assert.ok(Math.abs(boat.speed - tracks[0].speed) < 0.01);
  }
});

test("cruise follows the river and makes smooth U-turns at both ends without touching a boundary", () => {
  const boat = createNavigation();
  let minZ = boat.z,
    maxZAfterLower = -Infinity,
    lowerSeen = false,
    upperSeen = false;
  let largestStep = 0,
    largestTurn = 0,
    largestLateral = 0;
  for (let i = 0; i < 230 * 60; i++) {
    const x = boat.x,
      z = boat.z,
      heading = boat.heading;
    stepNavigation(boat, { cruise: true }, 1 / 60);
    inside(boat);
    largestStep = Math.max(largestStep, Math.hypot(boat.x - x, boat.z - z));
    largestTurn = Math.max(largestTurn, Math.abs(boat.heading - heading));
    largestLateral = Math.max(
      largestLateral,
      Math.abs(boat.x - riverCenter(boat.z)),
    );
    minZ = Math.min(minZ, boat.z);
    if (boat.z < -205) lowerSeen = true;
    if (lowerSeen) maxZAfterLower = Math.max(maxZAfterLower, boat.z);
    if (lowerSeen && boat.z > 68) upperSeen = true;
  }
  assert.ok(
    lowerSeen && upperSeen,
    `both turns must occur: min=${minZ}, returning max=${maxZAfterLower}`,
  );
  assert.ok(boat.z < 30, "must travel downriver again after the upper U-turn");
  assert.ok(
    minZ > -225 && maxZAfterLower < 85,
    "turn before hitting the end of the channel",
  );
  assert.ok(
    largestStep < 0.084 && largestTurn < 0.017,
    "no position or heading teleports",
  );
  assert.ok(
    largestLateral < 12,
    `cruise must stay clear of banks: ${largestLateral}`,
  );
  assert.ok(boat.distance > 650);
});

test("cruise resumes from either heading and resets without replacing the state object", () => {
  for (const heading of [0, Math.PI]) {
    const boat = createNavigation();
    boat.z = -70;
    boat.x = riverCenter(-70) + 8;
    boat.heading = heading;
    run(boat, { cruise: true }, 10);
    inside(boat);
    assert.ok(Math.abs(boat.x - riverCenter(boat.z)) < 2);
    assert.ok(heading === 0 ? boat.z < -90 : boat.z > -50);
    stepNavigation(boat, { cruise: false, steer: -1 }, 1 / 60);
    assert.equal(boat._cruising, false);
    const identity = boat;
    assert.equal(resetNavigation(boat), identity);
    assert.deepEqual(boat, createNavigation());
  }
});
