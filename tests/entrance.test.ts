import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURTAIN_MATCH, CURTAIN_WAIT_MS, waitForCurtainMatch } from '../src/entrance';

function curtain(paused = false) {
  let callback: VideoFrameRequestCallback | undefined;
  const video = Object.assign(new EventTarget(), {
    videoWidth: 1280,
    paused,
    seeking: false,
    error: null,
    requestVideoFrameCallback: vi.fn((next: VideoFrameRequestCallback) => {
      callback = next;
      return 1;
    }),
    cancelVideoFrameCallback: vi.fn(() => (callback = undefined)),
  });
  return {
    video: video as unknown as HTMLVideoElement,
    frame(time: number) {
      const next = callback;
      callback = undefined;
      next?.(performance.now(), { mediaTime: time } as VideoFrameCallbackMetadata);
    },
    hasCallback: () => Boolean(callback),
  };
}

describe('responsive curtain matching', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    vi.stubGlobal('document', { hidden: false });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses a nearby matching frame and cancels the fallback timer', async () => {
    const clip = curtain();
    const wait = waitForCurtainMatch(clip.video, new AbortController().signal);
    clip.frame(CURTAIN_MATCH - 0.1);
    await vi.advanceTimersByTimeAsync(100);
    clip.frame(CURTAIN_MATCH + 0.01);
    expect(await wait).toBe(true);
    expect(clip.hasCallback()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])(
    'bounds the wait even if the decoder stalls (paused=%s)',
    async (paused) => {
      const clip = curtain(paused);
      const wait = waitForCurtainMatch(clip.video, new AbortController().signal);
      clip.frame(6);
      await vi.advanceTimersByTimeAsync(CURTAIN_WAIT_MS);
      expect(await wait).toBe(false);
      expect(clip.hasCallback()).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not count time spent in a menu or hidden tab', async () => {
    const clip = curtain();
    let paused = true;
    const finished = vi.fn();
    const wait = waitForCurtainMatch(clip.video, new AbortController().signal, () => paused);
    void wait.then(finished);
    await vi.advanceTimersByTimeAsync(5000);
    expect(finished).not.toHaveBeenCalled();
    paused = false;
    await vi.advanceTimersByTimeAsync(CURTAIN_WAIT_MS);
    expect(await wait).toBe(false);
  });

  it('cancels all work on Skip, without a later transition', async () => {
    const clip = curtain();
    const controller = new AbortController();
    const wait = waitForCurtainMatch(clip.video, controller.signal);
    const rejection = expect(wait).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejection;
    expect(clip.hasCallback()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
