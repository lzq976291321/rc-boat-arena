import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoatWaterInteraction } from '../../src/scene-assets/boat-water-interaction/index.js';
import { createWakeHistory, WAKE_CAPACITY, WAKE_LIFETIME } from '../../src/scene-assets/boat-water-interaction/trail.js';
import { BOATS } from '../../src/scene-assets/sunny-cove/config/boats.js';

const boat = (overrides = {}) => ({ x: 0, z: 0, heading: 0, speed: 1, turnRate: 0, ...overrides });
const flat = () => ({ height: 0, slopeX: 0, slopeZ: 0 });
const create = () => createBoatWaterInteraction({ sampleSurface: flat });
const uniforms = interaction => Object.fromEntries(Object.entries(interaction.uniforms)
  .map(([name, uniform]) => [name, ArrayBuffer.isView(uniform.value) ? [...uniform.value] : uniform.value]));
const snapshot = interaction => ({ state: interaction.snapshot(), uniforms: uniforms(interaction) });
const finiteUniforms = interaction => Object.values(uniforms(interaction)).flat().every(Number.isFinite);
const points = history => Array.from({ length: history.count }, (_, i) => [...history.points.slice(i * 4, i * 4 + 4)]);

test('stopping preserves the existing trail, ages it naturally and removes it within 12 seconds', () => {
  const interaction = create(); interaction.reset(0, boat());
  for (let i = 1; i <= 30; i++) interaction.update(.1, i / 10, boat({ z: -i / 10 }));
  const before = snapshot(interaction), count = before.state.trail.count;
  assert.ok(count > 2);
  interaction.update(.1, 3.1, boat({ z: -3, speed: 0 }));
  assert.equal(interaction.snapshot().trail.count, count, 'zero speed must not clear or add points');
  assert.equal(interaction.uniforms.uContactHull.value[3], 0);
  const aged = interaction.uniforms.uWakePoints.value;
  for (let i = 0; i < count; i++) {
    assert.equal(aged[i * 4], before.uniforms.uWakePoints[i * 4]);
    assert.equal(aged[i * 4 + 1], before.uniforms.uWakePoints[i * 4 + 1]);
    assert.ok(aged[i * 4 + 2] > before.uniforms.uWakePoints[i * 4 + 2]);
  }
  for (let i = 32; i <= 140; i++) interaction.update(.1, i / 10, boat({ z: -3, speed: 0 }));
  assert.ok(interaction.snapshot().trail.count > 0, 'youngest trail should still fade after 11 seconds');
  for (let i = 141; i <= 150; i++) interaction.update(.1, i / 10, boat({ z: -3, speed: 0 }));
  assert.equal(WAKE_LIFETIME, 12); assert.equal(interaction.snapshot().trail.count, 0);
  assert.equal(interaction.uniforms.uWakeCount.value, 0);
  assert.ok([...interaction.uniforms.uWakePoints.value].every(value => value === 0));
  for (let i = 151; i <= 200; i++) interaction.update(.1, i / 10, boat({ z: -3, speed: 0 }));
  assert.equal(interaction.snapshot().trail.count, 0, 'a stationary hull must not generate new trail');
  interaction.dispose();
});

test('pause freezes pose, point ages, uniforms and history even when supplied time advances', () => {
  const interaction = create(); interaction.reset(0, boat());
  interaction.update(.1, .1, boat({ z: -.1 }));
  const before = snapshot(interaction), pointBuffer = interaction.uniforms.uWakePoints.value;
  for (const dt of [0, -1, NaN, Infinity]) interaction.update(dt, 100, boat({ x: 100 }));
  assert.deepEqual(snapshot(interaction), before);
  assert.equal(interaction.uniforms.uWakePoints.value, pointBuffer);
  interaction.dispose();
});

test('a turn adds the new stern position while old points stay in world coordinates', () => {
  const history = createWakeHistory();
  for (let i = 1; i <= 6; i++) history.update(.1, i / 10, boat({ z: -i / 10 }));
  const before = points(history); assert.ok(before.length >= 2);
  history.update(.3, .9, boat({ z: -.6, heading: Math.PI / 2, turnRate: 1 }));
  const after = points(history);
  assert.ok(after[0][0] > .9 && Math.abs(after[0][1] + .6) < 1e-6, 'new point must use the rotated stern');
  for (const old of before) assert.ok(after.some(next => next[0] === old[0] && next[1] === old[1]
    && next[3] === old[3] && next[2] > old[2]), 'old wake point moved with the hull');
  history.dispose();
});

test('teleport and reverse time discard old trails without a connecting stripe', () => {
  const interaction = create(); interaction.reset(0, boat());
  for (let i = 1; i <= 20; i++) interaction.update(.1, i / 10, boat({ z: -i / 10 }));
  interaction.update(.1, 2.1, boat({ x: 80, z: -50 }));
  assert.equal(interaction.snapshot().trail.count, 1);
  assert.equal(interaction.uniforms.uWakePoints.value[0], 80);
  assert.ok(Math.abs(interaction.uniforms.uWakePoints.value[1] + 49.04) < 1e-5);
  interaction.update(.1, 2.2, boat({ x: -80, z: 50, speed: 0 }));
  assert.equal(interaction.snapshot().trail.count, 0);
  interaction.update(.1, 2.3, boat({ x: -80, z: 49.9 }));
  interaction.update(.1, 1, boat({ x: -80, z: 49.8 }));
  assert.equal(interaction.snapshot().trail.count, 1);
  assert.equal(interaction.uniforms.uWakePoints.value[2], 0);
  interaction.dispose();
});

test('capacity and backing arrays remain bounded through sustained movement', () => {
  const history = createWakeHistory(), pointBuffer = history.points, boundsBuffer = history.bounds;
  let maxCount = 0;
  for (let i = 1; i <= 1500; i++) {
    history.update(.1, i / 10, boat({ z: -i * .2, speed: 2 }));
    maxCount = Math.max(maxCount, history.count);
    assert.ok(history.count <= WAKE_CAPACITY);
    assert.ok([...history.points, ...history.bounds].every(Number.isFinite));
  }
  assert.ok(maxCount >= 25 && maxCount <= WAKE_CAPACITY);
  const oldestAge = history.points[(history.count - 1) * 4 + 2];
  assert.ok(oldestAge > 11 && oldestAge < WAKE_LIFETIME, 'oldest waves must fade before a capacity cutoff');
  assert.equal(history.points.length, WAKE_CAPACITY * 4);
  assert.equal(history.points, pointBuffer); assert.equal(history.bounds, boundsBuffer);
  history.dispose();
});

test('reset is deterministic, clears trail and supports omitted or invalid fields', () => {
  const interaction = create(), fresh = create();
  interaction.reset(0, boat()); interaction.update(.1, .1, boat({ z: -.1 }));
  const poseReference = interaction.pose, pointBuffer = interaction.uniforms.uWakePoints.value;
  assert.equal(interaction.reset(), poseReference); fresh.reset();
  assert.deepEqual(snapshot(interaction), snapshot(fresh));
  assert.deepEqual([...interaction.uniforms.uContactHull.value], [0, 0, 0, 0]);
  interaction.reset(NaN, { x: 2, z: Infinity, heading: NaN, speed: Infinity, turnRate: NaN });
  fresh.reset(0, boat({ x: 2, speed: 0 }));
  assert.deepEqual(snapshot(interaction), snapshot(fresh));
  assert.equal(interaction.uniforms.uWakePoints.value, pointBuffer);
  assert.ok(finiteUniforms(interaction));
  interaction.dispose(); fresh.dispose();
});

test('invalid updates cannot poison GPU buffers; invalid speed behaves as zero', () => {
  const interaction = create(); interaction.reset(0, boat({ speed: 0 }));
  const before = snapshot(interaction);
  for (const invalid of [undefined, null, {}, boat({ x: NaN }), boat({ z: Infinity }),
    boat({ x: 1e100 }), boat({ heading: Infinity })]) interaction.update(.1, .1, invalid);
  for (const time of [NaN, Infinity]) interaction.update(.1, time, boat());
  assert.deepEqual(snapshot(interaction), before);
  for (const speed of [NaN, Infinity, -Infinity]) {
    interaction.update(.1, .1, boat({ speed, turnRate: Infinity }));
    assert.equal(interaction.uniforms.uContactHull.value[3], 0);
    assert.equal(interaction.snapshot().trail.count, 0);
    assert.ok(finiteUniforms(interaction));
    assert.ok(Object.values(interaction.pose).every(Number.isFinite));
  }
  interaction.update(.1, .2, boat({ heading: 1e100, speed: 1e100 }));
  assert.ok(finiteUniforms(interaction)); assert.equal(interaction.uniforms.uContactHull.value[3], 30);
  assert.ok(Math.abs(interaction.uniforms.uContactHull.value[2]) <= Math.PI);
  interaction.dispose();
  for (const config of [{ length: Infinity }, { length: 1e100 }, { beam: 1e-100 }, { draft: NaN }])
    assert.throws(() => createBoatWaterInteraction(config), TypeError);
  const direct = createWakeHistory();
  direct.update(.1, .1, boat()); const directBefore = { ...direct.snapshot(), points: [...direct.points], bounds: [...direct.bounds] };
  for (const args of [[Infinity, 1, boat()], [.1, NaN, boat()], [.1, 1, null], [.1, 1, boat({ z: NaN })]]) direct.update(...args);
  assert.deepEqual({ ...direct.snapshot(), points: [...direct.points], bounds: [...direct.bounds] }, directBefore);
  direct.dispose();
  for (const length of [0, NaN, Infinity, 1e100, 1e-100]) assert.throws(() => createWakeHistory({ length }), TypeError);
});

test('two instances have separate uniforms and repeated disposal cannot disable the survivor', () => {
  const first = create(), second = create(); first.reset(); second.reset();
  for (const name of ['uContactHull', 'uContactSize', 'uWakePoints', 'uWakeBounds'])
    assert.notEqual(first.uniforms[name].value, second.uniforms[name].value);
  first.update(.1, .1, boat({ z: -.1 })); second.update(.1, .1, boat({ x: 2, z: -.1 }));
  const secondBefore = snapshot(second);
  first.dispose(); first.dispose();
  const disposed = snapshot(first);
  first.reset(); first.update(.1, 2, boat());
  assert.deepEqual(snapshot(first), disposed); assert.deepEqual(snapshot(second), secondBefore);
  assert.equal(first.uniforms.uContactEnabled.value, 0); assert.equal(first.uniforms.uWakeCount.value, 0);
  assert.ok([...first.uniforms.uWakePoints.value].every(value => value === 0));
  second.update(.2, .3, boat({ x: 2, z: -.3 }));
  assert.equal(second.uniforms.uContactEnabled.value, 1); assert.equal(second.snapshot().disposed, false);
  assert.notDeepEqual(snapshot(second), secondBefore);
  assert.ok(finiteUniforms(second)); second.dispose();
});

test('default contact shape and stern location retain the original standalone behavior', () => {
  const original = create(), explicit = createBoatWaterInteraction({ length: 2.4, beam: .738, draft: .11,
    sternWidth: .79, bowTaper: .58, wakeStrength: 1, sternOffset: .4, sampleSurface: flat });
  assert.deepEqual([...original.uniforms.uContactShape.value], [.79, .58, 1].map(Math.fround));
  for (let frame = 1; frame <= 40; frame++) {
    const state = boat({ x: Math.sin(frame / 20), z: -frame / 10, heading: frame / 30,
      speed: frame < 30 ? .8 : 0 });
    original.update(.1, frame / 10, state); explicit.update(.1, frame / 10, state);
    assert.deepEqual(snapshot(original), snapshot(explicit));
  }
  const history = createWakeHistory(); history.update(.1, .1, boat({ x: 2, z: 3 }));
  assert.ok(Math.abs(history.points[0] - 2) < 1e-6);
  assert.ok(Math.abs(history.points[1] - 3.96) < 1e-6);
  assert.equal(history.points[3], 1);
  original.dispose(); explicit.dispose(); history.dispose();
});

test('selected hull dimensions, contact shape and stern trail remain isolated between both boat profiles', () => {
  const beams = { 'riva-aquarama': .738211833252415, 'maverick-gt': .905438596491228 };
  const interactions = BOATS.map(definition => createBoatWaterInteraction({ length: definition.length,
    beam: beams[definition.id], draft: definition.draft, ...definition.contact, sampleSurface: flat }));
  for (let index = 0; index < interactions.length; index++) {
    const interaction = interactions[index], definition = BOATS[index], shape = definition.contact;
    assert.deepEqual([...interaction.uniforms.uContactSize.value],
      [definition.length, beams[definition.id], definition.draft].map(Math.fround));
    assert.deepEqual([...interaction.uniforms.uContactShape.value],
      [shape.sternWidth, shape.bowTaper, shape.wakeStrength].map(Math.fround));
    const state = boat({ x: 3, z: -2, heading: Math.PI / 2, speed: .85 });
    interaction.reset(0, state); interaction.update(.1, .1, state);
    const wake = interaction.uniforms.uWakePoints.value;
    assert.equal(interaction.uniforms.uWakeCount.value, 1);
    assert.ok(Math.abs(wake[0] - (3 + definition.length * shape.sternOffset)) < 1e-6);
    assert.ok(Math.abs(wake[1] + 2) < 1e-6);
    assert.equal(wake[3], Math.fround(shape.wakeStrength));
  }
  const [first, second] = interactions, surviving = snapshot(second);
  for (const name of ['uContactHull', 'uContactSize', 'uContactShape', 'uWakePoints', 'uWakeBounds'])
    assert.notEqual(first.uniforms[name].value, second.uniforms[name].value);
  first.uniforms.uContactShape.value[0] = .25;
  assert.equal(BOATS[0].contact.sternWidth, .79, 'GPU buffer edits must not alter catalog metadata');
  first.reset(); first.dispose(); first.dispose();
  assert.deepEqual(snapshot(second), surviving, 'replacing one hull must not change the other water instance');
  second.update(.4, .5, boat({ x: 3.4, z: -2, heading: 0, speed: .85 }));
  assert.ok(second.snapshot().trail.count > 1);
  const wake = second.uniforms.uWakePoints.value;
  assert.ok(Math.abs(wake[0] - 3.4) < 1e-6);
  assert.ok(Math.abs(wake[1] - (-2 + BOATS[1].length * BOATS[1].contact.sternOffset)) < 1e-6);
  assert.equal(wake[4], surviving.uniforms.uWakePoints[0], 'old stern samples remain in world coordinates');
  assert.equal(wake[5], surviving.uniforms.uWakePoints[1]);
  assert.ok(finiteUniforms(second)); second.dispose();
});

test('contact profiles reject unsupported or non-finite shapes before they reach water uniforms', () => {
  for (const config of [{ sternWidth: 0 }, { sternWidth: 1.1 }, { sternWidth: NaN },
    { bowTaper: .1 }, { bowTaper: 1 }, { bowTaper: Infinity },
    { wakeStrength: -1 }, { wakeStrength: 3 }, { wakeStrength: NaN },
    { sternOffset: .1 }, { sternOffset: .7 }, { sternOffset: Infinity }])
    assert.throws(() => createBoatWaterInteraction(config), TypeError);
  for (const config of [{ sternOffset: .1 }, { sternOffset: NaN }, { wakeStrength: Infinity }, { wakeStrength: -1 }])
    assert.throws(() => createWakeHistory(config), TypeError);
});
