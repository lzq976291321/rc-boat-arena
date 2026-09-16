// Pure Node regression checks for the actual driving, timing and recording rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/input.js';
import { createBoat, stepBoat, collideWorld } from '../src/physics.js';
import { Race, RaceState } from '../src/race.js';
import { Recorder, ReplayPlayer } from '../src/replay.js';
import { buildCourse } from '../src/course.js';
import { BASE, DEFAULT_PARAMS, PRESETS } from '../src/config.js';
import { saveResult, loadRecords, clearRecords, formatTime } from '../src/storage.js';
import { simulateRace } from './sim-race.mjs';

const DT = 1 / 120;
const close = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);
function drive(b, cmd, seconds, params = DEFAULT_PARAMS) {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepBoat(b, cmd, params, DT, null, i * DT);
  return b;
}
function keyboard() {
  const handlers = {};
  const target = { addEventListener(name, fn) { handlers[name] = fn; } };
  const input = new Input(target);
  const emit = (name, key, editable = false, modifiers = {}) => handlers[name]({ key, target: { closest: () => editable }, preventDefault() {}, ...modifiers });
  return { input, emit, blur: () => handlers.blur() };
}
function raceFixture(laps = 1) {
  const course = buildCourse();
  const b = createBoat(0, 0, 0);
  const race = new Race(course, { laps, countdown: 0 });
  race.start(); race.update(DT, b);
  return { course, b, race };
}
function cross(race, boat, gate, forward = true) {
  const sign = forward ? 1 : -1;
  boat.x = gate.x - gate.dirX * 5 * sign;
  boat.z = gate.z - gate.dirZ * 5 * sign;
  race.resync(boat);
  boat.x = gate.x + gate.dirX * 5 * sign;
  boat.z = gate.z + gate.dirZ * 5 * sign;
  return race.update(1, boat);
}

test('WASD and arrow keys turn toward the actual right/left side of the boat', () => {
  for (const heading of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    for (const [key, side] of [['a', -1], ['ArrowLeft', -1], ['d', 1], ['ArrowRight', 1]]) {
      const { input, emit } = keyboard();
      const b = createBoat(0, 0, heading);
      emit('keydown', 'w');
      drive(b, input.read(), 3);
      emit('keydown', key);
      drive(b, input.read(), 0.75);
      const rightX = -Math.cos(heading), rightZ = Math.sin(heading);
      const rightProjection = Math.sin(b.heading) * rightX + Math.cos(b.heading) * rightZ;
      assert.ok(rightProjection * side > 0.2, `${key} at heading ${heading} turned the wrong way`);
      assert.ok(b.roll * side > 0, `${key} banked the wrong way`);
    }
  }
});

test('reverse steering changes the bow direction and preserves reverse movement', () => {
  for (const steer of [-1, 1]) {
    const b = createBoat(0, 0, 0);
    drive(b, { throttle: -1, steer: 0 }, 3);
    drive(b, { throttle: -1, steer }, 0.75);
    assert.ok(b.forwardSpeed < -2);
    assert.ok(b.heading * steer > 0);
  }
});

test('mirrored left/right manoeuvres have equal speed and mirrored trajectories', () => {
  for (const params of [DEFAULT_PARAMS, PRESETS.stable, PRESETS.agile]) {
    for (const throttle of [1, -1]) {
      const left = createBoat(0, 0, 0), right = createBoat(0, 0, 0);
      for (const b of [left, right]) drive(b, { throttle, steer: 0 }, 5, params);
      drive(left, { throttle, steer: -1 }, 5, params);
      drive(right, { throttle, steer: 1 }, 5, params);
      close(left.speed, right.speed);
      close(left.x, -right.x); close(left.z, right.z); close(left.heading, -right.heading);
    }
  }
});

test('spool builds at the configured rate, and colliding at a buoy centre produces a valid response', () => {
  const b = createBoat(0, 0, 0);
  stepBoat(b, { throttle: 1, steer: 0 }, DEFAULT_PARAMS, DT, null, 0);
  close(b.spool, DT / BASE.SPOOL_TIME);
  b.x = 0; b.z = 0; b.vz = 10;
  collideWorld(b, { buoys: [{ x: 0, z: 0, r: 1.35 }] }, DT, 0, -1);
  assert.ok(b.z < -1, 'boat must leave the centre of the buoy');
  assert.ok(b.vz < 0, 'incoming motion must reflect away from the buoy');
  assert.equal(b.collisions, 1);
});

test('editing settings does not drive the boat; blur releases keyboard and touch input', () => {
  const { input, emit, blur } = keyboard();
  emit('keydown', 'ArrowRight', true);
  assert.equal(input.read().steer, 0);
  emit('keydown', 'w'); input.setOverride({ throttle: 1, steer: 1 });
  blur();
  assert.deepEqual(input.read(), { throttle: 0, steer: 0, boost: false });
});

test('browser shortcuts cannot become driving commands, while Shift and Space remain game input', () => {
  const { input, emit } = keyboard();
  for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) {
    for (const key of ['w', 'a', 's', 'd', 'ArrowLeft', 'ArrowUp']) {
      emit('keydown', key, false, { [modifier]: true });
      assert.deepEqual(input.read(), { throttle: 0, steer: 0, boost: false });
      assert.equal(input.has(key), false);
    }
  }
  emit('keydown', 'Shift');
  assert.equal(input.read().boost, true);
  emit('keydown', 'w'); emit('keydown', ' ');
  assert.equal(input.read().throttle, 0);
  assert.equal(input.has(' '), true);
});

test('skipped, reverse, repeated gates and finish-line-only crossings cannot advance the race', () => {
  const { course, b, race } = raceFixture();
  assert.equal(cross(race, b, course.sequence[1]), null);
  assert.equal(cross(race, b, course.finish), null);
  assert.equal(cross(race, b, course.sequence[0], false), null);
  assert.equal(race.nextSeq, 0);
  assert.equal(cross(race, b, course.sequence[0]).event, 'checkpoint');
  for (let i = 0; i < 3; i++) assert.equal(cross(race, b, course.sequence[0]), null);
  assert.equal(race.nextSeq, 1);
  assert.equal(race.lapTimes.length, 0);
});

test('rescue resets movement, cannot cross a gate by teleporting, and adds to each official result', () => {
  const { course, b, race } = raceFixture(2);
  b.speed = 35; b.forwardSpeed = 35; b.vx = 10; b.vz = 20;
  b.lastHit = { kind: 'shore' }; b.stuckTime = 4;
  const result = race.rescue(b);
  assert.equal(result.penalty, 2);
  assert.equal(b.speed, 0); assert.equal(b.forwardSpeed, 0);
  assert.equal(b.stuckTime, 0); assert.equal(b.lastHit, null);
  assert.equal(race.update(DT, b), null);
  assert.equal(race.nextSeq, 0);
  for (const gate of course.sequence) cross(race, b, gate);
  assert.equal(race.lap, 2);
  race.rescue(b);
  let finish;
  for (const gate of course.sequence) finish = cross(race, b, gate);
  assert.equal(finish.event, 'finish');
  assert.equal(finish.penalty, 4);
  close(finish.total, finish.rawTotal + 4);
  close(race.lapTimes.reduce((a, value) => a + value, 0), finish.total);
  close(race.lapTime, race.lapTimes.at(-1));
  close(race.snapshot().time, finish.total);
});

test('debug finish preserves the current lap time instead of reporting zero', () => {
  const { b, race } = raceFixture();
  race.update(12, b); race.rescue(b);
  const result = race.forceFinish();
  assert.equal(result.total, 14);
  assert.equal(result.lapTime, 14);
});

test('assisted runs remain history entries and cannot replace personal records', () => {
  const data = new Map();
  globalThis.localStorage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  clearRecords();
  const result = (total, assisted) => saveResult({ total, laps: 3, lapTimes: [total / 3, total / 3, total / 3], params: DEFAULT_PARAMS, assisted });
  result(90, false);
  const ai = result(60, true);
  assert.equal(ai.isNewTotal, false); assert.equal(ai.isNewLap, false);
  assert.equal(loadRecords().bestTotal, 90);
  assert.equal(loadRecords().bestLap, 30);
  assert.equal(loadRecords().history[0].assisted, true);
  result(84, false);
  assert.equal(loadRecords().bestTotal, 84);
  delete globalThis.localStorage;
});

test('time formatting carries hundredths across minute boundaries', () => {
  assert.equal(formatTime(59.999), '1:00.00');
  assert.equal(formatTime(119.999), '2:00.00');
  assert.equal(formatTime(60.01), '1:00.01');
  assert.equal(formatTime(null), '--.--');
});

test('recording captures event frames and the exact finish even between regular samples', () => {
  const { race, b } = raceFixture();
  const recorder = new Recorder(30);
  const cmd = { throttle: 1, steer: 0, boost: false };
  recorder.start(); recorder.sample(0, b, cmd, race);
  race.update(DT, b); recorder.sample(race.time, b, cmd, race);
  assert.equal(recorder.frames.length, 1);
  race.forceFinish(); b.x = 12;
  recorder.sample(race.time, b, cmd, race, { force: true });
  recorder.stop({ total: race.finalTime });
  assert.equal(recorder.frames.length, 2);
  const player = new ReplayPlayer(recorder.serialize());
  assert.equal(player.poseAt(player.duration).x, 12);
  assert.equal(player.poseAt(player.duration).state, RaceState.FINISHED);
  close(player.duration, race.time, 0.0001);
  assert.equal(recorder.meta.duration, player.duration);
});

test('replay keeps checkpoint, lap and penalty changes at their actual times', () => {
  const frame = (t, props = {}) => ({ t, rt: t, x: t, z: 0, h: 0, v: 8, vf: -8, bob: 0.2, yaw: 0.1, slip: 0, roll: 0, pitch: 0, th: -1, st: 0, boost: 0, lap: 1, cp: 0, lt: t, pen: 0, rc: 0, nextSeq: 0, state: 'racing', ...props });
  const player = new ReplayPlayer({ frames: [frame(1), frame(2, { lap: 2, cp: 1, lt: 0, pen: 2, rt: 4, rc: 1, x: 100, nextSeq: 1, cut: true }), frame(3, { lap: 2, cp: 1, lt: 1, pen: 2, rt: 5, rc: 1, x: 101, nextSeq: 1 })] });
  const before = player.poseAt(1.9);
  assert.equal(before.lap, 1); assert.equal(before.cp, 0); assert.equal(before.pen, 0);
  assert.equal(before.x, 1, 'rescue must not fly through the lake');
  close(before.rt, 1.9); close(before.lt, 1.9);
  assert.equal(before.vf, -8); assert.equal(before.bob, 0.2);
  const after = player.poseAt(2);
  assert.equal(after.lap, 2); assert.equal(after.pen, 2); assert.equal(after.x, 100);
  close(after.rt, 4);
  player.seek(3); player.play(); assert.equal(player.t, 0);
  player.pause(); assert.equal(player.playing, false);
  const empty = new ReplayPlayer(null);
  assert.equal(empty.restart(), false); assert.equal(empty.playing, false);
});

test('rescue is recorded immediately and marked as a discontinuity', () => {
  const { race, b } = raceFixture();
  const recorder = new Recorder(30);
  recorder.start(); recorder.sample(0, b, { throttle: 0, steer: 0 }, race);
  race.update(DT, b); race.rescue(b);
  recorder.sample(race.time, b, { throttle: 0, steer: 0 }, race);
  assert.equal(recorder.frames.length, 2);
  assert.equal(recorder.frames.at(-1).cut, true);
  assert.equal(recorder.frames.at(-1).pen, 2);
});

test('replay records collisions and changes the count only at the recorded event', () => {
  const { race, b } = raceFixture();
  const recorder = new Recorder(30);
  const cmd = { throttle: 1, steer: 0 };
  recorder.start(); recorder.sample(0, b, cmd, race);
  race.update(1 / 30, b); b.collisions = 1;
  recorder.sample(race.time, b, cmd, race);
  race.update(1 / 30, b);
  recorder.sample(race.time, b, cmd, race);
  recorder.stop();
  const player = new ReplayPlayer(recorder.serialize());
  assert.equal(recorder.frames[1].hits, 1);
  assert.equal(player.poseAt(0.03).hits, 0, 'collision must not appear before its recorded frame');
  assert.equal(player.poseAt(recorder.frames[1].t).hits, 1);
  assert.equal(player.poseAt(0.04).hits, 1);
  assert.equal(player.poseAt(player.duration).hits, 1);
});

test('all presets still complete three ordered laps with AI after the steering/drag fixes', () => {
  for (const [name, params] of Object.entries({ default: DEFAULT_PARAMS, stable: PRESETS.stable, agile: PRESETS.agile })) {
    const result = simulateRace({ params, maxSeconds: 180 });
    assert.equal(result.finished, true, `${name} did not finish`);
    assert.equal(result.lapTimes.length, 3);
    assert.equal(result.rescues, 0);
    assert.equal(result.collisions, 0);
    assert.equal(result.events.filter((event) => event.event === 'checkpoint').length, 15);
  }
});
