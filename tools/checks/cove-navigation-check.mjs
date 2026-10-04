import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { COVE_ROUTE, createCoveNavigation, stepCoveNavigation, resetCoveNavigation } from "../../src/scene-assets/sunny-cove/navigation.js";
import { CAMERA_MODES, createCoveCamera } from "../../src/scene-assets/sunny-cove/camera.js";

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

test("all camera modes keep the complete boat visible and avoid pier through a full loop on desktop and portrait", () => {
  for (const aspect of [16 / 9, 16 / 10, 390 / 844, 320 / 800]) {
    for (const { id } of CAMERA_MODES) {
      const camera = new PerspectiveCamera(50, aspect, 0.1, 400), rig = createCoveCamera(camera);
      const boat = createCoveNavigation();
      rig.setMode(id); rig.snap(boat);
      let maxMovement = 0, maxTurn = 0;
      const seconds = id === "auto" ? 256 : 108;
      for (let i = 0; i < seconds * 30; i++) {
        const before = camera.position.clone(), rotation = camera.quaternion.clone();
        stepCoveNavigation(boat, 1 / 30); rig.update(1 / 30, i / 30, boat);
        camera.updateMatrixWorld();
        assert.ok(camera.position.y >= .82 && camera.position.x >= -8.4 && camera.position.x <= 9.2);
        const pierX = Math.max(-11, Math.min(-3, camera.position.x));
        const pierZ = Math.max(-1, Math.min(1.5, camera.position.z));
        assert.ok(Math.hypot(camera.position.x - pierX, camera.position.z - pierZ) >= 1.2, "camera entered the pier corridor");
        if (id !== "waterline" && id !== "auto") {
          assert.ok(camera.position.y >= 2.2 && camera.position.x >= -3.2 && camera.position.x <= 8.5);
          assert.ok(camera.position.z >= 3 || camera.position.x >= -.5);
        }
        maxMovement = Math.max(maxMovement, camera.position.distanceTo(before));
        maxTurn = Math.max(maxTurn, camera.quaternion.angleTo(rotation));
        for (const across of [-0.39, 0.39]) for (const along of [-1.23, 1.23]) for (const height of [-.14, .52]) {
          const x = boat.x + Math.cos(boat.heading) * across + Math.sin(boat.heading) * along;
          const z = boat.z - Math.sin(boat.heading) * across + Math.cos(boat.heading) * along;
          const projected = new Vector3(x, height, z).project(camera);
          assert.ok(projected.z < 1 && Math.abs(projected.x) < 0.98 && Math.abs(projected.y) < 0.98,
            `${id} clips hull: aspect=${aspect}, t=${i / 30}, position=${projected.toArray()}`);
        }
      }
      assert.ok(maxMovement < 0.2, `${id} position jump ${maxMovement}`);
      assert.ok(maxTurn < 0.035, `${id} camera whip ${maxTurn}`);
    }
  }
});

test("camera invalid dt, resize, snap, reduced motion and disposal leave deterministic state", () => {
  const camera = new PerspectiveCamera(), rig = createCoveCamera(camera, { reducedMotion: true });
  const boat = createCoveNavigation();
  assert.equal(rig.snapshot().mode, "scenic");
  rig.resize(390, 844); rig.snap(boat);
  const before = rig.snapshot();
  for (const dt of [0, -1, NaN, Infinity]) rig.update(dt, 99, boat);
  rig.snap(boat);
  assert.deepEqual(rig.snapshot(), before);
  rig.setMode("follow");
  for (let i = 0; i < 1000; i++) rig.update(0.05, i, boat);
  assert.equal(rig.snapshot().activeMode, "follow");
  rig.dispose();
  const position = camera.position.clone(), aspect = camera.aspect;
  rig.update(1, 1, boat); rig.resize(1, 1); rig.snap(boat);
  assert.ok(position.equals(camera.position)); assert.equal(camera.aspect, aspect);
});


test("waterline opens the automatic sequence with a large side view and stays independent of boat yaw", () => {
  assert.deepEqual(CAMERA_MODES.map(({ id }) => id), ["auto", "waterline", "follow", "scenic", "overview"]);
  for (const aspect of [16 / 9, 16 / 10, 390 / 844, 320 / 800]) {
    const camera = new PerspectiveCamera(50, aspect, .1, 400), rig = createCoveCamera(camera);
    const boat = createCoveNavigation(); rig.snap(boat); camera.updateMatrixWorld();
    assert.equal(rig.snapshot().activeMode, "waterline");
    assert.ok(camera.position.y >= .82 && camera.position.y <= 1.31, "close view must reveal the waterline");
    const corners = [];
    for (const across of [-.39, .39]) for (const along of [-1.23, 1.23]) {
      corners.push(new Vector3(boat.x + Math.cos(boat.heading) * across + Math.sin(boat.heading) * along, .2,
        boat.z - Math.sin(boat.heading) * across + Math.cos(boat.heading) * along).project(camera));
    }
    const width = (Math.max(...corners.map(point => point.x)) - Math.min(...corners.map(point => point.x))) / 2;
    assert.ok(aspect > 1 ? width >= .41 && width <= .52 : width >= .58 && width <= .76,
      `waterline width ${width} at aspect ${aspect}`);
    for (const aft of [1.14, 1.7, 2.4]) {
      const wake = new Vector3(boat.x + Math.sin(boat.heading) * aft, .02,
        boat.z + Math.cos(boat.heading) * aft).project(camera);
      assert.ok(Math.abs(wake.x) < .97 && Math.abs(wake.y) < .97, "initial framing must retain the stern and its near wake");
    }
    const before = camera.position.clone();
    rig.setMode("waterline"); boat.heading += Math.PI; rig.snap(boat);
    assert.ok(camera.position.equals(before), "turning the boat must not orbit the close camera");
  }
});
