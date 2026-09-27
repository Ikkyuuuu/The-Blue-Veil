// Original procedural effects. Buffers are built once, then reused by Web Audio;
// there are no downloaded samples, network requests or per-frame synthesis.
export type Effect = 'step' | 'snuff' | 'draw' | 'land' | 'inspect';

function noise(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 2147483648 - 1;
  };
}

export function createEffectBuffers(ctx: BaseAudioContext): Record<Effect, AudioBuffer> {
  const durations = { step: 0.32, snuff: 0.65, draw: 0.48, land: 0.12, inspect: 0.28 };
  return Object.fromEntries(
    Object.entries(durations).map(([name, duration], index) => {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      const random = noise(127 + index);
      let low = 0,
        previous = 0;
      const smoothing = 1 - Math.exp((-2 * Math.PI * 1100) / ctx.sampleRate);
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        const white = random();
        low += smoothing * (white - low);
        const high = white - low;
        const attack = Math.min(1, t / 0.008);
        const release = Math.min(1, (duration - t) / 0.035);
        let value = 0;
        if (name === 'step') {
          // A soft heel on dirt followed by a little grit under the sole.
          const thud = Math.sin(2 * Math.PI * (84 * t - 48 * t * t));
          value = 0.19 * thud * Math.exp(-t * 27) + 0.2 * low * Math.exp(-t * 13);
          value += 0.025 * high * Math.exp(-Math.pow((t - 0.09) / 0.065, 2));
        } else if (name === 'snuff') {
          // Rounded breath, then a fine dying-wick hiss; no explosive pop.
          const breath = Math.pow(Math.sin((Math.PI * t) / duration), 2) * Math.exp(-t * 5);
          value = (0.75 * low + 0.075 * high) * breath;
        } else if (name === 'draw') {
          // Two close paper fibres separating, followed by the slide on cloth.
          const swish = Math.exp(-Math.pow((t - 0.13) / 0.09, 2));
          const slide = Math.exp(-Math.pow((t - 0.3) / 0.12, 2));
          value = (0.09 * high + 0.08 * low) * (swish + 0.6 * slide);
          value += 0.018 * (white - previous) * Math.exp(-t * 50);
        } else if (name === 'inspect') {
          // A quick card lift with a small paper flutter as it turns toward you.
          const lift = Math.exp(-Math.pow((t - 0.055) / 0.04, 2));
          const flutter = Math.exp(-Math.pow((t - 0.14) / 0.055, 2));
          value = (0.095 * high + 0.13 * low) * (lift + 0.45 * flutter);
          value += 0.025 * Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 45);
        } else {
          value = (0.07 * low + 0.07 * Math.sin(2 * Math.PI * 170 * t)) * Math.exp(-t * 45);
        }
        data[i] = value * attack * Math.max(0, release);
        previous = white;
      }
      return [name, buffer];
    }),
  ) as Record<Effect, AudioBuffer>;
}

export function createWind(ctx: BaseAudioContext, output: AudioNode) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 6, ctx.sampleRate);
  const data = buffer.getChannelData(0),
    random = noise(851);
  for (let i = 0; i < data.length; i++) data[i] = random();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const low = ctx.createBiquadFilter(),
    high = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 650;
  low.Q.value = 0.5;
  high.type = 'highpass';
  high.frequency.value = 100;
  const gust = ctx.createGain(),
    mix = ctx.createGain();
  gust.gain.value = 0.2;
  mix.gain.value = 0;
  const lfo = ctx.createOscillator(),
    depth = ctx.createGain();
  lfo.frequency.value = 0.12;
  depth.gain.value = 0.09;
  lfo.connect(depth).connect(gust.gain);
  source.connect(low).connect(high).connect(gust).connect(mix).connect(output);
  source.start();
  lfo.start();
  return { mix, low };
}

// Quiet, beating glass-like harmonics. The media clock supplies the swell,
// so a paused/stalled orb never keeps building toward an unrelated climax.
export function createOrbTone(ctx: BaseAudioContext, output: AudioNode) {
  const mix = ctx.createGain();
  mix.gain.value = 0;
  mix.connect(output);
  for (const [frequency, level] of [
    [130.81, 0.022],
    [196, 0.014],
    [261.62, 0.012],
    [523.9, 0.006],
  ]) {
    const oscillator = ctx.createOscillator(),
      partial = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    partial.gain.value = level;
    oscillator.connect(partial).connect(mix);
    oscillator.start();
  }
  return mix;
}
