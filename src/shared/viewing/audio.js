// Procedural water ambience. No AudioContext is created before a user gesture.
export function createAmbience({ volume = 0.15 } = {}) {
  let context, output, filter, source, modulator, modulation;
  let enabled = false, hidden = false, disposed = false, mood = 'moonlight', revision = 0;
  const frequency = () => ({ moonlight: 640, dawn: 900, afternoon: 860, sunset: 740, bluehour: 620 })[mood] ?? 640;
  function create() {
    context = new AudioContext();
    output = context.createGain();
    output.gain.value = 0;
    output.connect(context.destination);
    const buffer = context.createBuffer(2, context.sampleRate * 7, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.022) / 1.022;
        // Crossfade the loop boundary to avoid a click every seven seconds.
        const edge = Math.min(1, i / 2400, (data.length - 1 - i) / 2400);
        data[i] = last * 3 * edge;
      }
    }
    source = context.createBufferSource();
    source.buffer = buffer; source.loop = true;
    filter = context.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = frequency();
    source.connect(filter); filter.connect(output); source.start();
    modulator = context.createOscillator(); modulation = context.createGain();
    modulator.frequency.value = 0.12; modulation.gain.value = 95;
    modulator.connect(modulation); modulation.connect(filter.frequency); modulator.start();
  }
  return {
    get enabled() { return enabled; },
    async setEnabled(value) {
      if (disposed) return false;
      const current = ++revision;
      enabled = !!value;
      if (value && !context) create();
      if (context && value && !hidden) await context.resume();
      if (disposed || current !== revision) return enabled;
      output?.gain.setTargetAtTime(enabled ? volume : 0, context.currentTime, 0.5);
      return enabled;
    },
    setMood(value) {
      mood = value;
      filter?.frequency.setTargetAtTime(frequency(), context.currentTime, 1.2);
    },
    async visibility(value) {
      hidden = value;
      if (!context || disposed) return;
      if (hidden) await context.suspend();
      else if (enabled) await context.resume();
    },
    dispose() {
      if (disposed) return;
      disposed = true; enabled = false; revision++;
      source?.stop(); modulator?.stop();
      source?.disconnect(); modulator?.disconnect(); modulation?.disconnect();
      filter?.disconnect(); output?.disconnect();
      void context?.close().catch(() => {});
    },
  };
}
