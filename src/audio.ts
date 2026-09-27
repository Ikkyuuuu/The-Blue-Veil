import { createEffectBuffers, createWind, createOrbTone, type Effect } from './sound-effects';
import { BackgroundMusic } from './music';

// A slow, deliberate walk: one footfall every 1.1 seconds of the entrance clip.
const FOOTSTEP_INTERVAL = 1.1;

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
  private effects?: Record<Effect, AudioBuffer>;
  private wind?: ReturnType<typeof createWind>;
  private orbTone?: GainNode;
  private orbLevel = 0;
  private orbActive = false;
  private readerSpeaking = false;
  private music?: BackgroundMusic;
  private outdoors = true;
  private walkingVideo?: HTMLVideoElement;
  private footstepTimer?: ReturnType<typeof setTimeout>;
  private lastWalkTime = -1;
  private lastStep = -1;
  private transients = new Set<{ source: AudioScheduledSourceNode; gain: GainNode }>();
  muted = false;

  private initialize() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    this.effects = createEffectBuffers(this.ctx);
    this.wind = createWind(this.ctx, this.master);
    this.orbTone = createOrbTone(this.ctx, this.master);
    this.orbTone.gain.value = this.orbLevel;
    this.updateWind();
    this.music = new BackgroundMusic(this.ctx, this.master);
  }

  private updateMusic(retry = false) {
    this.music?.update(
      {
        enabled: !this.outdoors && !this.muted && !this.paused && this.ctx?.state === 'running',
        speaking: this.readerSpeaking,
        orb: this.orbActive,
      },
      retry,
    );
  }

  speaking(active: boolean) {
    this.readerSpeaking = active;
    this.updateMusic();
  }

  private updateWind() {
    if (!this.ctx || !this.wind) return;
    this.wind.mix.gain.setTargetAtTime(this.outdoors ? 1 : 0.2, this.ctx.currentTime, 0.7);
    this.wind.low.frequency.setTargetAtTime(this.outdoors ? 650 : 280, this.ctx.currentTime, 0.7);
  }

  scene(outdoors: boolean, walkingVideo?: HTMLVideoElement) {
    this.outdoors = outdoors;
    this.updateWind();
    this.updateMusic();
    if (this.walkingVideo === walkingVideo) return;
    this.walkingVideo = walkingVideo;
    this.lastWalkTime = -1;
    this.lastStep = -1;
    this.scheduleFootsteps();
  }

  private scheduleFootsteps() {
    clearTimeout(this.footstepTimer);
    if (!this.walkingVideo || this.muted || this.paused || this.ctx?.state !== 'running') return;
    const tick = () => {
      const video = this.walkingVideo;
      if (!video || this.muted || this.paused || this.ctx?.state !== 'running') return;
      const time = video.currentTime;
      const step = Math.floor(time / FOOTSTEP_INTERVAL);
      // Use the media clock: buffering, seeking or a paused clip cannot march on.
      // A delayed callback emits at most one step, never a backlog of footsteps.
      if (
        !video.paused &&
        !video.ended &&
        !video.seeking &&
        video.readyState >= 2 &&
        time > this.lastWalkTime &&
        this.lastWalkTime >= 0 &&
        step !== this.lastStep
      ) {
        this.effect('step', step % 2 ? 0.13 : -0.13, step % 2 ? 1.03 : 0.97);
      }
      this.lastStep = step;
      this.lastWalkTime = time;
      this.footstepTimer = setTimeout(tick, 60);
    };
    this.footstepTimer = setTimeout(tick, 60);
  }

  private track(source: AudioScheduledSourceNode, gain: GainNode, cleanup: () => void) {
    const transient = { source, gain };
    this.transients.add(transient);
    source.addEventListener(
      'ended',
      () => {
        this.transients.delete(transient);
        source.disconnect();
        gain.disconnect();
        cleanup();
      },
      { once: true },
    );
  }

  effect(name: Effect, pan = 0, rate = 1) {
    if (this.muted || this.paused || this.ctx?.state !== 'running') return;
    const source = this.ctx.createBufferSource(),
      gain = this.ctx.createGain();
    const position = this.ctx.createStereoPanner();
    source.buffer = this.effects![name];
    source.playbackRate.value = rate;
    position.pan.value = pan;
    source.connect(gain).connect(position).connect(this.master!);
    this.track(source, gain, () => position.disconnect());
    source.start();
  }

  private applyVolume() {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.muted || this.paused ? 0 : 1, now, 0.01);
  }

  orb(active: boolean, phase: number) {
    if (active !== this.orbActive) {
      this.orbActive = active;
      this.updateMusic();
    }
    this.orbLevel = active ? 0.35 + 0.65 * Math.sin(Math.PI * phase) ** 2 : 0;
    if (!this.ctx || !this.orbTone) return;
    this.orbTone.gain.setTargetAtTime(this.orbLevel, this.ctx.currentTime, active ? 0.12 : 0.18);
  }

  // Called inside a user gesture, including when returning to a saved reading.
  async activate() {
    if (this.muted || this.paused) return;
    if (this.ctx?.state === 'running') {
      this.updateMusic(true);
      return;
    }
    this.initialize();
    await this.ctx!.resume();
    // The player may have muted or paused while the browser was resuming audio.
    this.applyVolume();
    this.scheduleFootsteps();
    this.updateMusic(true);
  }

  async toggle() {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopVoice();
      clearTimeout(this.footstepTimer);
      // Muted one-shots must not reappear if the player unmutes immediately.
      const now = this.ctx?.currentTime ?? 0;
      for (const { source, gain } of this.transients) {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(0, now, 0.003);
        source.stop(now + 0.015);
      }
      this.transients.clear();
    } else {
      try {
        await this.activate();
      } catch (error) {
        this.muted = true;
        throw error;
      }
    }
    this.applyVolume();
    this.scheduleFootsteps();
    this.updateMusic();
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

  visibility(hidden: boolean) {
    this.paused = hidden;
    if (hidden) this.stopVoice(true);
    this.applyVolume();
    this.updateMusic();
    clearTimeout(this.footstepTimer);
    if (this.ctx)
      void (hidden || this.muted ? this.ctx.suspend() : this.ctx.resume())
        .then(() => {
          this.scheduleFootsteps();
          this.updateMusic();
        })
        .catch(() => {});
  }
}
