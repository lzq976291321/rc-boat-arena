import test from "node:test";
import assert from "node:assert/strict";
import { createAmbience } from "../../src/shared/viewing/audio.js";

// Delayed resume is the browser boundary that caused the regression. Keep this
// substitute small: inspect audible gain and resource lifetime, not DSP output.
function audioContextStub(t) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  const instances = [];
  const parameter = () => ({
    value: 0,
    targets: [],
    setTargetAtTime(value) { this.targets.push(value); },
  });
  class AudioNodeStub {
    gain = parameter();
    frequency = parameter();
    stopCount = 0;
    disconnectCount = 0;
    connect() {}
    start() {}
    stop() {
      assert.equal(this.stopCount, 0, "an audio source must only be stopped once");
      this.stopCount++;
    }
    disconnect() { this.disconnectCount++; }
  }
  class AudioContextStub {
    sampleRate = 32;
    currentTime = 0;
    destination = {};
    state = "suspended";
    nodes = [];
    resumes = [];
    closeCount = 0;
    suspendCount = 0;
    constructor() { instances.push(this); }
    createNode() {
      const node = new AudioNodeStub();
      this.nodes.push(node);
      return node;
    }
    createGain() { return this.createNode(); }
    createBufferSource() { return this.createNode(); }
    createBiquadFilter() { return this.createNode(); }
    createOscillator() { return this.createNode(); }
    createBuffer(channels, length) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: channel => data[channel] };
    }
    resume() {
      return new Promise(resolve => this.resumes.push(() => {
        if (this.state !== "closed") this.state = "running";
        resolve();
      }));
    }
    async suspend() { this.suspendCount++; this.state = "suspended"; }
    async close() { this.closeCount++; this.state = "closed"; }
  }
  Object.defineProperty(globalThis, "AudioContext", { value: AudioContextStub, configurable: true });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "AudioContext", descriptor);
    else delete globalThis.AudioContext;
  });
  return instances;
}

test("ambience allocates no audio context until explicitly enabled", async (t) => {
  const instances = audioContextStub(t);
  const ambience = createAmbience();
  assert.equal(ambience.enabled, false);
  ambience.setMood("dawn");
  await ambience.visibility(true);
  await ambience.visibility(false);
  assert.equal(await ambience.setEnabled(false), false);
  assert.equal(instances.length, 0);
  ambience.dispose();
  ambience.dispose();
  assert.equal(await ambience.setEnabled(true), false);
  assert.equal(instances.length, 0, "disposing before enable must not allocate a context");
});

test("a pending enable cannot reverse a newer explicit disable", async (t) => {
  const instances = audioContextStub(t);
  const ambience = createAmbience({ volume: 0.2 });
  t.after(() => ambience.dispose());
  const olderEnable = ambience.setEnabled(true);
  const context = instances[0], output = context.nodes[0];
  assert.equal(instances.length, 1);
  assert.equal(context.resumes.length, 1);
  assert.equal(await ambience.setEnabled(false), false);
  assert.equal(ambience.enabled, false);
  context.resumes[0]();
  assert.equal(await olderEnable, false);
  assert.equal(ambience.enabled, false);
  assert.deepEqual(output.gain.targets, [0], "stale enable must not schedule audible gain");
});

test("resolving an old resume after disposal cannot revive sound or resources", async (t) => {
  const instances = audioContextStub(t);
  const ambience = createAmbience();
  const pendingEnable = ambience.setEnabled(true);
  const context = instances[0], output = context.nodes[0];
  ambience.dispose();
  ambience.dispose();
  context.resumes[0]();
  assert.equal(await pendingEnable, false);
  assert.equal(ambience.enabled, false);
  assert.deepEqual(output.gain.targets, []);
  assert.equal(context.closeCount, 1);
  assert.equal(context.state, "closed");
  assert.equal(await ambience.setEnabled(true), false);
  assert.equal(instances.length, 1);
  for (const node of context.nodes) assert.equal(node.disconnectCount, 1);
  assert.equal(context.nodes.filter(node => node.stopCount === 1).length, 2);
});

test("enabled ambience can suspend, resume and dispose twice without duplicating sources", async (t) => {
  const instances = audioContextStub(t);
  const ambience = createAmbience({ volume: 0.2 });
  const enable = ambience.setEnabled(true);
  const context = instances[0];
  context.resumes[0]();
  assert.equal(await enable, true);
  assert.deepEqual(context.nodes[0].gain.targets, [0.2]);
  await ambience.visibility(true);
  assert.equal(context.suspendCount, 1);
  const reveal = ambience.visibility(false);
  context.resumes[1]();
  await reveal;
  assert.equal(context.state, "running");
  assert.equal(instances.length, 1);
  ambience.dispose();
  ambience.dispose();
  assert.equal(context.closeCount, 1);
  assert.equal(ambience.enabled, false);
  for (const node of context.nodes) assert.equal(node.disconnectCount, 1);
});
