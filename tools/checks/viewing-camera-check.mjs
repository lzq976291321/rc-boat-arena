import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { CAMERA_MODES, createViewingCamera } from "../../src/scene-assets/moonwater/camera.js";
import { riverCenter, createNavigation, stepNavigation } from "../../src/scene-assets/moonwater/navigation.js";

const create = (options = {}) => {
  const camera = new PerspectiveCamera(46, 16 / 9, 0.1, 500);
  const rig = createViewingCamera(camera, { riverCenter, riverHalfWidth: 18, ...options });
  return { camera, rig };
};
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const inWater = (camera) => {
  assert.ok(Math.abs(camera.position.x - riverCenter(camera.position.z)) <= 15 + 1e-9);
  assert.ok(camera.position.y >= 1.2);
  assert.ok([...camera.position, ...camera.quaternion, camera.fov].every(Number.isFinite));
};

test("all modes initialize safely; zero and invalid dt never alter an initialized frame", () => {
  assert.deepEqual(CAMERA_MODES.map(({ id }) => id), ["auto", "follow", "scenic", "overview"]);
  for (const { id } of CAMERA_MODES) {
    const { camera, rig } = create();
    const boat = createNavigation();
    rig.setMode(id);
    rig.update(0, 0, boat);
    inWater(camera);
    const before = rig.snapshot();
    for (const dt of [0, -1, NaN, Infinity]) rig.update(dt, 99, boat);
    assert.deepEqual(rig.snapshot(), before);
    rig.snap(boat);
    assert.deepEqual(rig.snapshot(), before, "snap of an unchanged subject must be idempotent");
  }
});

test("automatic shots transition without cuts through a full cycle and both river turns", () => {
  const { camera, rig } = create();
  const boat = createNavigation();
  rig.snap(boat);
  const seen = new Set();
  let largestStep = 0, largestAngle = 0;
  for (let i = 0; i < 230 * 60; i++) {
    const position = camera.position.clone(), rotation = camera.quaternion.clone();
    stepNavigation(boat, { cruise: true }, 1 / 60);
    rig.update(1 / 60, i / 60, boat);
    inWater(camera);
    seen.add(rig.snapshot().activeMode);
    largestStep = Math.max(largestStep, position.distanceTo(camera.position));
    largestAngle = Math.max(largestAngle, rotation.angleTo(camera.quaternion));
  }
  assert.deepEqual([...seen], ["follow", "scenic", "overview"]);
  assert.ok(largestStep < 0.3, `camera cut: ${largestStep}`);
  assert.ok(largestAngle < 0.03, `camera whip: ${largestAngle}`);
});

test("30, 60 and 144 Hz keep the camera framing and sequence stable", () => {
  const states = [30, 60, 144].map((hz) => {
    const { rig } = create();
    const boat = { x: riverCenter(40), z: 40, heading: 0, speed: 2 };
    rig.snap(boat);
    for (let i = 1; i <= 70 * hz; i++) {
      const t = i / hz;
      boat.z = 40 - t * 2;
      boat.x = riverCenter(boat.z);
      boat.heading = 0.2 * Math.sin(t * 0.1);
      rig.update(1 / hz, t, boat);
    }
    return rig.snapshot();
  });
  for (const state of states.slice(1)) {
    assert.equal(state.activeMode, states[0].activeMode);
    assert.ok(distance(state.position, states[0].position) < 0.07);
    assert.ok(distance(state.target, states[0].target) < 0.04);
    assert.ok(Math.abs(state.fov - states[0].fov) < 0.02);
  }
});

test("manual shots stay locked, motion preference starts in follow, and resume stays on the selected shot", () => {
  const { rig } = create({ reducedMotion: true });
  const boat = createNavigation();
  assert.equal(rig.snapshot().mode, "follow");
  for (const id of ["scenic", "overview", "follow"]) {
    assert.equal(rig.setMode(id), id);
    for (let i = 0; i < 2000; i++) rig.update(0.1, i * 0.1, boat);
    assert.equal(rig.snapshot().activeMode, id);
    assert.equal(rig.snapshot().mode, id);
    rig.setMode("auto");
    rig.update(1 / 60, 10000, boat);
    assert.equal(rig.snapshot().activeMode, id);
  }
  const before = rig.snapshot().mode;
  assert.equal(rig.setMode("unknown"), before);
});

test("bank-facing and wrapped headings remain safe, and a suspended frame cannot skip a shot", () => {
  const { camera, rig } = create();
  const boat = { x: riverCenter(-50) + 14.9, z: -50, heading: Math.PI - 0.01, speed: 0 };
  rig.setMode("scenic");
  rig.snap(boat);
  boat.heading = -Math.PI + 0.01;
  const previous = camera.position.clone();
  rig.update(1 / 60, 0, boat);
  assert.ok(camera.position.distanceTo(previous) < 0.05, "heading wrap caused an orbit");
  rig.setMode("auto");
  const before = rig.snapshot();
  rig.update(10000, 10000, boat);
  assert.ok(rig.snapshot().elapsed - before.elapsed <= 0.1000001);
  inWater(camera);
});

test("portrait framing keeps the complete boat in view and host-owned camera survives dispose", () => {
  const { camera, rig } = create();
  const boat = { x: riverCenter(0), z: 0, heading: 0, speed: 0 };
  for (const [width, height] of [[1440, 900], [390, 844], [320, 800]]) {
    rig.resize(width, height);
    for (const { id } of CAMERA_MODES) {
      rig.setMode(id);
      rig.snap(boat);
      camera.updateMatrixWorld();
      for (const x of [-0.9, 0.9]) for (const z of [-2.6, 2.6]) {
        const projected = new Vector3(boat.x + x, 0.8, boat.z + z).project(camera);
        assert.ok(Math.abs(projected.x) < 0.92 && Math.abs(projected.y) < 0.92, `${id} clips hull at ${width}x${height}`);
      }
      inWater(camera);
    }
  }
  rig.dispose();
  const before = camera.position.clone(), aspect = camera.aspect;
  rig.update(1, 1, { x: 99, z: 99, heading: 1 });
  rig.snap(boat);
  rig.resize(1, 1);
  assert.ok(camera.position.equals(before));
  assert.equal(camera.aspect, aspect);
  assert.equal(rig.snapshot().disposed, true);
});
