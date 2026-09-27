export const MUSIC_URL = '/assets/music/a-dragons-lullaby-2023.mp3';

type MusicState = { enabled: boolean; speaking: boolean; orb: boolean };

// Stream the original MP3 rather than decoding the whole song into a large
// AudioBuffer. The shared master gain still controls all game sounds together.
export class BackgroundMusic {
  private audio = document.createElement('audio');
  private gain: GainNode;
  private state: MusicState = { enabled: false, speaking: false, orb: false };
  private starting = false;
  private blocked = false;

  constructor(
    private ctx: AudioContext,
    output: AudioNode,
  ) {
    this.audio.id = 'background-music';
    this.audio.hidden = true;
    this.audio.preload = 'none';
    this.audio.loop = true;
    this.audio.setAttribute('aria-hidden', 'true');
    document.body.append(this.audio);
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    ctx.createMediaElementSource(this.audio).connect(this.gain).connect(output);
    this.audio.addEventListener('timeupdate', () => this.mix());
    this.audio.addEventListener('playing', () => {
      if (!this.state.enabled) this.audio.pause();
      else this.mix();
    });
  }

  update(state: MusicState, retry = false) {
    this.state = state;
    if (retry) this.blocked = false;
    if (!state.enabled) {
      this.audio.pause();
      this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
      return;
    }
    if (!this.audio.src) this.audio.src = MUSIC_URL;
    if (this.audio.paused && !this.starting && !this.blocked) {
      this.starting = true;
      let interrupted = false;
      void this.audio
        .play()
        .then(() => {
          if (!this.state.enabled) this.audio.pause();
          else this.mix();
        })
        .catch((error: unknown) => {
          // A missing asset or autoplay restriction must not block gameplay.
          // A later user gesture may retry; orb ticks never spin on failures.
          interrupted = error instanceof DOMException && error.name === 'AbortError';
          this.blocked = !interrupted;
        })
        .finally(() => {
          this.starting = false;
          // A quick pause/resume can cancel a pending play request. Resume once
          // it settles; actual autoplay/media failures wait for another gesture.
          if (interrupted && this.state.enabled && this.audio.paused && !this.blocked)
            this.update(this.state);
        });
    }
    this.mix();
  }

  private mix() {
    if (!this.state.enabled || this.audio.paused) return;
    const { currentTime, duration } = this.audio;
    const edge = Math.max(
      0,
      Math.min(1, currentTime / 2, Number.isFinite(duration) ? (duration - currentTime) / 2 : 1),
    );
    const level = this.state.orb ? 0.055 : this.state.speaking ? 0.075 : 0.16;
    // Preserve the composition, softening its beginning/end each time it repeats.
    this.gain.gain.setTargetAtTime(level * edge, this.ctx.currentTime, 0.3);
  }
}
