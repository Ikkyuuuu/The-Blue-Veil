// Original synthesized character voice; no samples or speech service are used.
export function readerBlip(
  ctx: BaseAudioContext,
  output: AudioNode,
  character: string,
  now = ctx.currentTime,
) {
  const seed = character.toLowerCase().codePointAt(0) ?? 0;
  const oscillator = ctx.createOscillator(),
    filter = ctx.createBiquadFilter(),
    gain = ctx.createGain();
  const pitch = 195 + (seed % 7) * 4;
  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(pitch * 1.03, now);
  oscillator.frequency.exponentialRampToValueAtTime(pitch * 0.96, now + 0.045);
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(850 + (seed % 5) * 60, now);
  filter.frequency.exponentialRampToValueAtTime(700, now + 0.045);
  filter.Q.value = 1.1;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.09, now + 0.003);
  gain.gain.setValueAtTime(0.09, now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  oscillator.start(now);
  oscillator.stop(now + 0.055);
  oscillator.onended = () => {
    oscillator.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
  return { oscillator, gain };
}

export class Sound {
  private ctx?: AudioContext;
  private master?: GainNode;
  private paused = false;
  private lastVoice = -Infinity;
  private voices = new Set<ReturnType<typeof readerBlip>>();
  muted = true;

  private initialize() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    const ambience = this.ctx.createGain();
    ambience.gain.value = 0.012;
    ambience.connect(this.master);
    for (const frequency of [73.42, 110, 146.83]) {
      const oscillator = this.ctx.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(ambience);
      oscillator.start();
    }
  }

  async toggle() {
    if (this.muted) {
      this.initialize();
      if (!this.paused) await this.ctx!.resume();
      this.muted = false;
    } else {
      this.muted = true;
      this.stopVoice();
    }
    const now = this.ctx!.currentTime;
    this.master!.gain.cancelScheduledValues(now);
    this.master!.gain.setTargetAtTime(this.muted ? 0 : 1, now, 0.01);
    return !this.muted;
  }

  voice(text: string) {
    const character = text.match(/[a-z0-9]/i)?.[0];
    if (!character || this.muted || this.paused || this.ctx?.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.lastVoice < 0.065) return;
    this.lastVoice = now;
    const voice = readerBlip(this.ctx, this.master!, character, now);
    this.voices.add(voice);
    voice.oscillator.addEventListener('ended', () => this.voices.delete(voice), { once: true });
  }

  stopVoice(immediate = false) {
    this.lastVoice = -Infinity;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(now);
      if (immediate) voice.gain.gain.setValueAtTime(0, now);
      else voice.gain.gain.setTargetAtTime(0, now, 0.003);
      voice.oscillator.stop(now + (immediate ? 0 : 0.012));
    }
    this.voices.clear();
  }

  chime(index = 0) {
    if (this.muted || this.paused || this.ctx?.state !== 'running') return;
    const now = this.ctx.currentTime;
    for (const [n, freq] of [293.66, 440, 587.33].entries()) {
      const oscillator = this.ctx.createOscillator(),
        gain = this.ctx.createGain();
      oscillator.frequency.value = freq * (1 + index * 0.12);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.045 / (n + 1), now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
      oscillator.connect(gain);
      gain.connect(this.master!);
      oscillator.start(now);
      oscillator.stop(now + 1.7);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
  }

  visibility(hidden: boolean) {
    this.paused = hidden;
    if (hidden) this.stopVoice(true);
    if (this.ctx)
      void (hidden || this.muted ? this.ctx.suspend() : this.ctx.resume()).catch(() => {});
  }
}
