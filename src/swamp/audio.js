// Original procedural ambience; no external recordings or autoplay.
export function createAmbience() {
  let context,
    gain,
    enabled = false;
  async function setEnabled(value) {
    enabled = value;
    if (value && !context) {
      context = new AudioContext();
      gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(context.destination);
      const buffer = context.createBuffer(
        2,
        context.sampleRate * 5,
        context.sampleRate,
      );
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        let last = 0;
        for (let i = 0; i < data.length; i++) {
          last = (last + (Math.random() * 2 - 1) * 0.025) / 1.025;
          data[i] = last * 3;
        }
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      source.connect(filter);
      filter.connect(gain);
      source.start();
      const mod = context.createOscillator(),
        depth = context.createGain();
      mod.frequency.value = 0.17;
      depth.gain.value = 160;
      mod.connect(depth);
      depth.connect(filter.frequency);
      mod.start();
    }
    if (context) {
      await context.resume();
      gain.gain.setTargetAtTime(value ? 0.17 : 0, context.currentTime, 0.4);
    }
    return enabled;
  }
  return {
    setEnabled,
    async visibility(hidden) {
      if (!context) return;
      if (hidden) await context.suspend();
      else if (enabled) await context.resume();
    },
    get enabled() {
      return enabled;
    },
  };
}
