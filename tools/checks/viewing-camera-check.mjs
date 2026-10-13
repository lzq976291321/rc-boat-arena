import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { createCoveNavigation, stepCoveNavigation } from "../../src/scene-assets/sunny-cove/navigation.js";
import { CAMERA_MODES, createCoveCamera } from "../../src/scene-assets/sunny-cove/camera.js";
import { BOATS } from "../../src/scene-assets/sunny-cove/config/boats.js";

test("all measured runtime hulls stay entirely framed through every camera mode and cruise phase", () => {
  // Runtime GLB geometry measured after authored transforms and display scaling;
  // use the full height, including Maverick's tall handlebars, not Riva's box.
  const measured = {
    'riva-aquarama': { length: 2.4, beam: .738211833252415, height: .5632309079558888, draft: .11 },
    'maverick-gt': { length: 2.6, beam: .905438596491228, height: .9247208931419457, draft: .1 },
    'motor-whaleboat': { length: 2.65, beam: .7366608893962433, height: .6319955426560812, draft: .234 },
    'assault-boat': { length: 2.4, beam: 1.0754789340060562, height: .5124745255048524, draft: .107 },
  };
  const failures = [];
  for (const definition of BOATS) for (const aspect of [16 / 9, 390 / 844, 320 / 800]) {
    for (const { id } of CAMERA_MODES) {
      const dimensions = measured[definition.id];
      assert.equal(dimensions.length, definition.length); assert.equal(dimensions.draft, definition.draft);
      const camera = new PerspectiveCamera(50, aspect, .1, 400), rig = createCoveCamera(camera);
      const boat = createCoveNavigation();
      rig.setBoatDimensions(dimensions); rig.setMode(id); rig.snap(boat);
      const seconds = id === 'auto' ? 256 : 108;
      let clipped = false;
      for (let frame = 0; frame <= seconds * 30 && !clipped; frame++) {
        if (frame > 0) { stepCoveNavigation(boat, 1 / 30); rig.update(1 / 30, frame / 30, boat); }
        camera.updateMatrixWorld();
        for (const across of [-dimensions.beam / 2, dimensions.beam / 2]) {
          for (const along of [-dimensions.length / 2, dimensions.length / 2]) {
            for (const y of [-dimensions.draft, dimensions.height - dimensions.draft]) {
              const projected = new Vector3(
                boat.x + Math.cos(boat.heading) * across + Math.sin(boat.heading) * along, y,
                boat.z - Math.sin(boat.heading) * across + Math.cos(boat.heading) * along).project(camera);
              if (projected.z <= -1 || projected.z >= 1 || Math.abs(projected.x) >= .98 || Math.abs(projected.y) >= .98) {
                if (!clipped) failures.push(`${definition.id}/${id}: aspect=${aspect}, t=${frame / 30}, phase=${boat.phase}, projected=${projected.toArray()}`);
                clipped = true;
              }
            }
          }
        }
      }
      rig.dispose();
    }
  }
  assert.deepEqual(failures, [], `measured hull clipping:\n${failures.join('\n')}`);
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
