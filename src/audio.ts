export class Sound {
  private ctx?: AudioContext;
  muted = true;
  private gain?: GainNode;
  async toggle() {
    this.muted = !this.muted;
    if (!this.muted) {
      this.ctx ??= new AudioContext();
      await this.ctx.resume();
      if (!this.gain) {
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0;
        this.gain.connect(this.ctx.destination);
        for (const frequency of [73.42, 110, 146.83]) {
          const osc = this.ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = frequency;
          osc.connect(this.gain);
          osc.start();
        }
      }
    }
    this.gain?.gain.setTargetAtTime(this.muted ? 0 : 0.012, this.ctx!.currentTime, 0.5);
    return !this.muted;
  }
  voice() {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime,
      oscillator = this.ctx.createOscillator(),
      gain = this.ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 150 + Math.random() * 25;
    gain.gain.setValueAtTime(0.016, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    oscillator.connect(gain);
    gain.connect(this.ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.05);
  }
  chime(index = 0) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [n, freq] of [293.66, 440, 587.33].entries()) {
      const osc = this.ctx.createOscillator(),
        gain = this.ctx.createGain();
      osc.frequency.value = freq * (1 + index * 0.12);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.045 / (n + 1), now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 1.7);
    }
  }
  visibility(hidden: boolean) {
    if (this.ctx) void (hidden ? this.ctx.suspend() : this.ctx.resume());
  }
}
