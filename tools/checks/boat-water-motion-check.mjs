import test from 'node:test';
import assert from 'node:assert/strict';
import { createHullMotion } from '../../src/scene-assets/boat-water-interaction/motion.js';

const boat = (overrides = {}) => ({ x: 0, z: 0, heading: 0, speed: 0, turnRate: 0, ...overrides });
const wave = (x, z, time) => ({
  height: .016 * Math.sin(.65 * x + .4 * z - 1.1 * time) + .009 * Math.cos(.3 * x - .8 * z + .7 * time),
  slopeX: .016 * .65 * Math.cos(.65 * x + .4 * z - 1.1 * time) - .009 * .3 * Math.sin(.3 * x - .8 * z + .7 * time),
  slopeZ: .016 * .4 * Math.cos(.65 * x + .4 * z - 1.1 * time) + .009 * .8 * Math.sin(.3 * x - .8 * z + .7 * time),
});
const advance = (motion, seconds, state, hz = 60, start = 0) => {
  for (let i = 1; i <= Math.round(seconds * hz); i++) {
    const time = start + i / hz;
    motion.update(1 / hz, time, typeof state === 'function' ? state(time) : state);
  }
  return motion.pose;
};

test('four hull corners recover water height and local attitude for arbitrary headings', () => {
  for (const heading of [0, Math.PI / 2, -.73]) {
    const samples = [];
    const motion = createHullMotion({ sampleSurface(x, z, time) {
      samples.push([x, z, time]); return { height: .023 + .012 * x - .018 * z, slopeX: .012, slopeZ: -.018 };
    } });
    motion.reset(3, boat({ x: 2, z: -1, heading }));
    assert.equal(samples.length, 4);
    assert.equal(new Set(samples.map(point => point.slice(0, 2).join(','))).size, 4);
    assert.ok(Math.abs(motion.pose.heave - .065) < 1e-12);
    assert.ok(Math.abs(motion.pose.pitch - Math.atan(-.012 * Math.sin(heading) + .018 * Math.cos(heading))) < 1e-12);
    assert.ok(Math.abs(motion.pose.roll - Math.atan(.012 * Math.cos(heading) + .018 * Math.sin(heading))) < 1e-12);
    motion.dispose();
  }
});

test('30/60/120 Hz follow the same moving water with submillimetre pose differences', context => {
  const route = time => boat({ x: 2 * Math.sin(time * .22), z: -time * .42,
    heading: .3 * Math.sin(time * .2), speed: .7 + .2 * Math.sin(time * .7), turnRate: .06 * Math.cos(time * .2) });
  const runs = [30, 60, 120].map(hz => {
    const motion = createHullMotion({ sampleSurface: wave }), poses = [];
    motion.reset(0, route(0));
    for (let frame = 1; frame <= hz * 20; frame++) {
      motion.update(1 / hz, frame / hz, route(frame / hz));
      if (frame % (hz / 30) === 0) poses.push({ ...motion.pose });
    }
    motion.dispose(); return poses;
  });
  const errors = { heave: 0, pitch: 0, roll: 0 };
  for (const run of runs.slice(1)) for (let i = 0; i < run.length; i++) for (const key of Object.keys(errors))
    errors[key] = Math.max(errors[key], Math.abs(run[i][key] - runs[0][i][key]));
  assert.ok(errors.heave < .00005, `heave drift ${errors.heave} m`);
  assert.ok(errors.pitch < .0001 && errors.roll < .0001, `angular drift ${JSON.stringify(errors)}`);
  context.diagnostic(`max differences: ${JSON.stringify(errors)} (metres/radians)`);
});

test('a moored boat follows water without a free-running bob or spring overshoot', () => {
  const motion = createHullMotion({ sampleSurface: (_x, _z, time) => ({ height: .018 * Math.sin(time * .9) }) });
  motion.reset(0, boat());
  let min = 1, max = -1, maxError = 0;
  for (let i = 1; i <= 20 * 60; i++) {
    const time = i / 60;
    motion.update(1 / 60, time, boat());
    if (time > 2) { min = Math.min(min, motion.pose.heave); max = Math.max(max, motion.pose.heave);
      maxError = Math.max(maxError, Math.abs(motion.pose.heave - .018 * Math.sin(time * .9))); }
    assert.equal(motion.pose.pitch, 0); assert.equal(motion.pose.roll, 0);
  }
  assert.ok(max - min > .032 && max - min < .0361);
  assert.ok(maxError < .0042, `moored waterline lag ${maxError} m`);
  motion.dispose();
  let height = 0;
  const step = createHullMotion({ sampleSurface: () => ({ height }) });
  step.reset(0, boat()); height = .025;
  let before = 0;
  for (let i = 1; i <= 120; i++) {
    step.update(1 / 60, i / 60, boat());
    assert.ok(step.pose.heave >= before && step.pose.heave <= height);
    before = step.pose.heave;
  }
  assert.ok(Math.abs(step.pose.heave - height) < .00001);
  step.dispose();
});

test('acceleration gently lifts the bow; braking removes trim without large rocking', () => {
  const moving = createHullMotion(), steady = createHullMotion();
  moving.reset(0, boat()); steady.reset(0, boat({ speed: 1.5 }));
  advance(moving, 2, time => boat({ z: -.375 * time ** 2, speed: .75 * time }));
  advance(steady, 2, boat({ speed: 1.5 }));
  assert.ok(moving.pose.pitch > steady.pose.pitch + .001);
  assert.ok(moving.pose.pitch < .022 && moving.pose.pitch > 0);
  const acceleratingPitch = moving.pose.pitch;
  advance(moving, 1, time => boat({ z: -1.5 - 1.5 * (time - 2) + .375 * (time - 2) ** 2,
    speed: 1.5 - .75 * (time - 2) }), 60, 2);
  assert.ok(moving.pose.pitch < acceleratingPitch - .006);
  assert.ok(Math.abs(moving.pose.heave) < 1e-12, 'trim must not lift the whole waterline clear');
  moving.dispose(); steady.dispose();
});

test('left/right turns lean inward independently of heading; a stationary hull does not bank', () => {
  for (const heading of [0, Math.PI / 2, -2]) for (const turnRate of [-.4, .4]) {
    const motion = createHullMotion();
    motion.reset(0, boat({ heading, speed: 1, turnRate: 0 }));
    advance(motion, 2, boat({ heading, speed: 1, turnRate }));
    assert.equal(Math.sign(motion.pose.roll), Math.sign(turnRate));
    assert.ok(Math.abs(motion.pose.roll) > .005 && Math.abs(motion.pose.roll) < .015);
    motion.reset(2, boat({ heading, turnRate }));
    advance(motion, 2, boat({ heading, turnRate }), 60, 2);
    assert.equal(motion.pose.roll, 0);
    motion.dispose();
  }
});

test('zero/invalid dt freezes sampling and history; invalid navigation stays finite', () => {
  let samples = 0;
  const motion = createHullMotion({ sampleSurface(x, z, time) {
    samples++; assert.ok([x, z, time].every(Number.isFinite)); return { height: NaN, slopeX: Infinity, slopeZ: NaN };
  } });
  motion.reset(0, boat());
  const before = motion.snapshot(), count = samples;
  for (const dt of [0, -1, NaN, Infinity]) motion.update(dt, 99, boat({ x: 100, speed: 2 }));
  assert.deepEqual(motion.snapshot(), before); assert.equal(samples, count);
  motion.update(1 / 60, NaN, { x: NaN, z: Infinity, heading: NaN, speed: Infinity, turnRate: NaN });
  assert.ok(Object.values(motion.pose).every(Number.isFinite));
  assert.deepEqual(motion.pose, { heave: 0, pitch: 0, roll: 0 });
  motion.dispose();
  for (const options of [{ length: NaN }, { beam: 0 }, { draft: Infinity }, { sampleSurface: 3 }])
    assert.throws(() => createHullMotion(options), TypeError);
});

test('reset and teleport discard velocity/acceleration history deterministically', () => {
  const motion = createHullMotion({ sampleSurface: wave }), fresh = createHullMotion({ sampleSurface: wave });
  motion.reset(0, boat()); advance(motion, 2, time => boat({ speed: time, z: -time * time / 2 }));
  const state = boat({ x: 3, z: 2, heading: .7, speed: .4, turnRate: -.1 });
  const stableReference = motion.pose;
  assert.equal(motion.reset(7, state), stableReference); fresh.reset(7, state);
  assert.deepEqual(motion.snapshot(), fresh.snapshot());
  motion.update(1 / 60, 7 + 1 / 60, boat({ ...state, speed: 2 }));
  const relocated = boat({ x: 80, z: -30, heading: -1, speed: .6 });
  motion.update(1 / 60, 7 + 2 / 60, relocated); fresh.reset(7 + 2 / 60, relocated);
  assert.deepEqual(motion.snapshot(), fresh.snapshot());
  motion.reset(7, state); assert.deepEqual(motion.pose, fresh.reset(7, state));
  motion.dispose(); fresh.dispose();
});

test('disposing one hull twice preserves its pose and the independently moving survivor', () => {
  let samples = 0;
  const surface = (x, z, time) => { samples++; return wave(x, z, time); };
  const first = createHullMotion({ sampleSurface: surface }), second = createHullMotion({ sampleSurface: surface });
  first.reset(0, boat()); second.reset(0, boat());
  const frozen = { ...first.pose }; first.dispose(); first.dispose();
  const count = samples;
  first.update(.1, 1, boat()); first.reset(3, boat({ speed: 1 }));
  assert.deepEqual(first.pose, frozen); assert.equal(samples, count);
  advance(second, 1, boat());
  assert.notDeepEqual(second.pose, frozen); assert.ok(samples > count);
  assert.equal(first.snapshot().disposed, true); assert.equal(second.snapshot().disposed, false);
  second.dispose();
});
