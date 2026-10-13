import test from "node:test";
import assert from "node:assert/strict";
import { COVE_ROUTE, createCoveNavigation, stepCoveNavigation, resetCoveNavigation } from "../../src/scene-assets/sunny-cove/navigation.js";
import { COVE_TOUR, routeAtBerth } from "../../src/scene-assets/sunny-cove/config/tour.js";

const wrap = value => Math.atan2(Math.sin(value), Math.cos(value));
const run = (state, seconds, hz = 60) => {
  for (let i = 0; i < seconds * hz; i++) stepCoveNavigation(state, 1 / hz);
  return state;
};
const safe = (boat) => {
  assert.ok(boat.x >= -7.8 && boat.x <= 8.8 && boat.z >= -12.8 && boat.z <= 6.8, "hull crossed activity boundary");
  const nearestX = Math.max(-11, Math.min(-3, boat.x)), nearestZ = Math.max(-1, Math.min(1.5, boat.z));
  assert.ok(Math.hypot(boat.x - nearestX, boat.z - nearestZ) >= 1.2, "hull touched the pier");
  for (const key of ["x", "z", "speed", "heading", "turnRate"]) assert.ok(Number.isFinite(boat[key]));
};

test("108-second cruise loop visits the berth continuously with 18 seconds of still mooring", () => {
  const boat = createCoveNavigation(), start = { ...boat }, seen = new Set();
  let docked = 0, maxStep = 0, maxTurn = 0;
  for (let i = 0; i < 108 * 60; i++) {
    const before = { ...boat };
    stepCoveNavigation(boat, 1 / 60);
    safe(boat); seen.add(boat.phase);
    maxStep = Math.max(maxStep, Math.hypot(boat.x - before.x, boat.z - before.z));
    maxTurn = Math.max(maxTurn, Math.abs(wrap(boat.heading - before.heading)));
    if (boat.phase === "docked") {
      docked++;
      assert.ok(Math.hypot(boat.x + 5, boat.z - 3.5) < 1e-9);
      assert.equal(boat.speed, 0);
      assert.ok(Math.abs(wrap(boat.heading + Math.PI / 2)) < 1e-9, "bow must face +X in berth");
    }
  }
  assert.deepEqual(new Set(["cruising", "approaching", "docked", "departing"]), seen);
  assert.ok(Math.abs(docked / 60 - 18) <= 1 / 60);
  assert.ok(maxStep < 0.025, `position jump ${maxStep}`);
  assert.ok(maxTurn < 0.025, `heading jump ${maxTurn}`);
  assert.ok(Math.hypot(boat.x - start.x, boat.z - start.z) < 1e-7, "loop must return without a teleport");
  assert.ok(start.z > 3 && start.z < 5, "initial boat must be in the foreground");
});

test("30, 60 and 144 Hz follow the same route, dock and depart with bounded dt", () => {
  for (const seconds of [33, 79, 99, 223]) {
    const states = [30, 60, 144].map(hz => run(createCoveNavigation(), seconds, hz));
    for (const state of states.slice(1)) {
      assert.ok(Math.hypot(state.x - states[0].x, state.z - states[0].z) < 1e-7);
      assert.ok(Math.abs(wrap(state.heading - states[0].heading)) < 1e-7);
      assert.equal(state.phase, states[0].phase);
    }
  }
  const boat = createCoveNavigation(), before = { ...boat };
  for (const dt of [0, -1, NaN, Infinity]) stepCoveNavigation(boat, dt);
  assert.deepEqual(boat, before);
  stepCoveNavigation(boat, 100);
  assert.ok(boat.elapsed <= 0.05);
  assert.ok(Math.hypot(boat.x - before.x, boat.z - before.z) < 0.05);
  assert.equal(resetCoveNavigation(boat), boat);
  assert.deepEqual(boat, before);
});

test("route and timing are configurable and incomplete loops fail explicitly", () => {
  const route = COVE_ROUTE.map(segment => segment.map(([x, z]) => [x + 1, z - 1]));
  const boat = createCoveNavigation({ route, travelDuration: 80, dwellDuration: 20, startProgress: 0 });
  assert.equal(boat.phase, "departing");
  assert.equal(boat.x, -4); assert.equal(boat.z, 2.5);
  run(boat, 90);
  assert.equal(boat.phase, "docked");
  assert.equal(boat.x, -4); assert.equal(boat.z, 2.5);
  assert.throws(() => createCoveNavigation({ route: [COVE_ROUTE[0]] }), /closed loop/);
});

test("world berth anchors rotate a closed route toward the configured bow without mutating its source", () => {
  const before = JSON.stringify(COVE_ROUTE);
  for (const heading of [0, Math.PI / 2, -.73, -Math.PI / 2]) {
    const position = { x: 4.2, z: -2.8 }, route = routeAtBerth(COVE_ROUTE, { position, heading });
    const boat = createCoveNavigation({ route, startProgress: 0 });
    assert.ok(Math.hypot(boat.x - position.x, boat.z - position.z) < 1e-10);
    assert.ok(Math.abs(wrap(boat.heading - heading)) < 1e-10);
    const [origin, handle] = route[0], direction = [handle[0] - origin[0], handle[1] - origin[1]];
    const distance = Math.hypot(...direction);
    assert.ok(Math.abs(direction[0] / distance + Math.sin(heading)) < 1e-10);
    assert.ok(Math.abs(direction[1] / distance + Math.cos(heading)) < 1e-10);
    assert.deepEqual(route.at(-1).at(-1), route[0][0]);
    run(boat, 108);
    assert.ok(Math.hypot(boat.x - position.x, boat.z - position.z) < 1e-8);
  }
  assert.equal(JSON.stringify(COVE_ROUTE), before);
  for (const anchor of [{ position: { x: NaN, z: 0 }, heading: 0 },
    { position: { x: 0, z: 0 }, heading: Infinity }]) assert.throws(() => routeAtBerth(COVE_ROUTE, anchor), TypeError);
});

test("a replacement rests in the berth for four seconds before a continuous departure and return", () => {
  const boat = createCoveNavigation(); run(boat, 21);
  assert.equal(resetCoveNavigation(boat, { atBerth: true, dwellDuration: COVE_TOUR.changeoverDwell }), boat);
  const berth = { ...boat };
  assert.equal(COVE_TOUR.changeoverDwell, 4); assert.equal(boat.phase, "docked"); assert.equal(boat.speed, 0);
  for (let frame = 0; frame < 4 * 60 - 1; frame++) {
    stepCoveNavigation(boat, 1 / 60);
    assert.equal(boat.phase, "docked");
    assert.ok(Math.hypot(boat.x - berth.x, boat.z - berth.z) < 1e-10);
  }
  const phases = new Set(); let maxStep = 0, maxTurn = 0;
  for (let frame = 0; frame < 108 * 60; frame++) {
    const before = { ...boat }; stepCoveNavigation(boat, 1 / 60); phases.add(boat.phase);
    maxStep = Math.max(maxStep, Math.hypot(boat.x - before.x, boat.z - before.z));
    maxTurn = Math.max(maxTurn, Math.abs(wrap(boat.heading - before.heading)));
    if (frame === 1) assert.equal(boat.phase, "departing");
  }
  assert.deepEqual(phases, new Set(["departing", "cruising", "approaching", "docked"]));
  assert.ok(maxStep < .025, `replacement route position jump ${maxStep}`);
  assert.ok(maxTurn < .025, `replacement route heading jump ${maxTurn}`);
  assert.equal(boat.phase, "docked");
  assert.ok(Math.hypot(boat.x - berth.x, boat.z - berth.z) < 1e-8);
});
