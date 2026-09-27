import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReadingOrb } from '../src/reading-orb';

class Clip extends EventTarget {
  currentTime = 0;
  duration = 8;
  loop = true;
  paused = true;
  seeking = false;
  readyState = 4;
  error: MediaError | null = null;
  play = vi.fn(async () => {
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
  });
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  end() {
    this.currentTime = 8;
    this.paused = true;
    this.dispatchEvent(new Event('ended'));
  }
}
function setup() {
  const video = new Clip(),
    sound = vi.fn();
  const orb = createReadingOrb(video as unknown as HTMLVideoElement, sound);
  orb.start();
  orb.update(false, false);
  return { video, sound, orb };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('orb reading boundary', () => {
  it('holds an immediate answer until the entire first pass ends', async () => {
    const { video, orb } = setup();
    const done = vi.fn();
    const completion = orb.finish().then(done);
    expect(video.loop).toBe(false);
    video.currentTime = 7.9;
    await vi.advanceTimersByTimeAsync(7900);
    expect(done).not.toHaveBeenCalled();
    video.end();
    await completion;
    expect(done).toHaveBeenCalledWith(true);
    expect(video.paused).toBe(true);
  });

  it('keeps looping for a slow answer, then finishes the current pass without rewinding', async () => {
    const { video, sound, orb } = setup();
    for (const time of [3, 7.9, 0.1, 5, 7.9, 0.1, 4.2]) {
      video.currentTime = time;
      await vi.advanceTimersByTimeAsync(100);
      expect(video.loop).toBe(true);
    }
    expect(sound).toHaveBeenLastCalledWith(true, 4.2 / 8);
    const done = vi.fn();
    const completion = orb.finish().then(done);
    expect(video.currentTime).toBe(4.2);
    video.currentTime = 7.95;
    await vi.advanceTimersByTimeAsync(100);
    expect(done).not.toHaveBeenCalled();
    video.end();
    await completion;
    expect(done).toHaveBeenCalledWith(true);
    expect(sound).toHaveBeenLastCalledWith(false, 0);
  });

  it('pauses the wait and silences the hum when the menu or decoder pauses', async () => {
    const { video, sound, orb } = setup();
    video.currentTime = 3;
    const done = vi.fn();
    const completion = orb.finish().then(done);
    orb.update(true, false);
    await vi.advanceTimersByTimeAsync(60000);
    expect(done).not.toHaveBeenCalled();
    expect(sound).toHaveBeenLastCalledWith(false, 0);
    orb.update(false, false);
    video.dispatchEvent(new Event('waiting'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sound).toHaveBeenLastCalledWith(false, 3 / 8);
    expect(done).not.toHaveBeenCalled();
    video.currentTime = 4;
    video.dispatchEvent(new Event('playing'));
    expect(sound).toHaveBeenLastCalledWith(true, 0.5);
    video.end();
    await completion;
    expect(done).toHaveBeenCalledWith(true);
  });

  it('cancels an abandoned answer and starts the next reading at zero', async () => {
    const { video, orb } = setup();
    video.currentTime = 6;
    const old = orb.finish();
    orb.start();
    expect(await old).toBe(false);
    expect(video.currentTime).toBe(0);
    orb.update(false, false);
    const next = orb.finish();
    video.end();
    expect(await next).toBe(true);
  });

  it('does not force an animation wait with reduced motion', async () => {
    const { video, orb } = setup();
    orb.update(false, true);
    expect(await orb.finish()).toBe(true);
    expect(video.paused).toBe(true);
  });

  it('releases a ready result on media failure or a permanently stalled decoder', async () => {
    const first = setup();
    const errorResult = first.orb.finish();
    first.video.dispatchEvent(new Event('error'));
    expect(await errorResult).toBe(true);
    const stalled = setup();
    const stalledResult = stalled.orb.finish();
    await vi.advanceTimersByTimeAsync(12000);
    expect(await stalledResult).toBe(true);
  });

  it('handles rejected playback without trapping a result', async () => {
    const { video, orb } = setup();
    video.play.mockRejectedValueOnce(new Error('Decoder unavailable'));
    orb.update(false, false);
    expect(await orb.finish()).toBe(true);
  });
});
