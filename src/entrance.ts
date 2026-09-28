// The supplied master fades up from black during its first 16 frames (24 fps).
// Seek past that baked-in fade; the game blends from the currently visible tent.
export const ENTRANCE_START = 16 / 24;
// Compared over six consecutive frames: the curtain opening and movement here
// most closely match the clear beginning of the supplied walking clip.
export const CURTAIN_MATCH = 112 / 24;
// Prefer the matching phase, but never leave a working entrance feeling inert
// for another whole curtain cycle. A longer blend covers an unmatched phase.
export const CURTAIN_WAIT_MS = 750;

function waitForFrame(video: HTMLVideoElement, ready: () => boolean, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const events = ['loadedmetadata', 'loadeddata', 'canplay', 'seeked'];
    const cleanup = () => {
      clearTimeout(timeout);
      events.forEach((event) => video.removeEventListener(event, check));
      video.removeEventListener('error', fail);
      signal?.removeEventListener('abort', abort);
    };
    const check = () => {
      if (!ready()) return;
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error('The entrance video could not be prepared.'));
    };
    const abort = () => {
      cleanup();
      reject(signal!.reason);
    };
    const timeout = setTimeout(fail, 8000);
    events.forEach((event) => video.addEventListener(event, check));
    video.addEventListener('error', fail);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    else if (video.error) fail();
    else check();
  });
}

export async function prepareEntrance(video: HTMLVideoElement, signal?: AbortSignal) {
  signal?.throwIfAborted();
  video.pause();
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    video.preload = 'auto';
    video.load();
    await waitForFrame(video, () => video.readyState >= HTMLMediaElement.HAVE_METADATA, signal);
  }
  video.currentTime = ENTRANCE_START;
  await waitForFrame(
    video,
    () => !video.seeking && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
    signal,
  );
}

export function waitForCurtainMatch(
  video: HTMLVideoElement,
  signal: AbortSignal,
  isPaused = () => document.hidden,
) {
  signal.throwIfAborted();
  if (video.error || !video.videoWidth) return Promise.resolve(false);
  return new Promise<boolean>((resolve, reject) => {
    let previous: number | undefined;
    let frame = 0;
    let waited = 0;
    let lastTick = performance.now();
    const useVideoFrames = typeof video.requestVideoFrameCallback === 'function';
    const cleanup = () => {
      if (useVideoFrames) video.cancelVideoFrameCallback(frame);
      else cancelAnimationFrame(frame);
      clearInterval(deadline);
      signal.removeEventListener('abort', abort);
      video.removeEventListener('error', fail);
    };
    const done = (matched: boolean) => {
      cleanup();
      resolve(matched);
    };
    const fail = () => done(false);
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const sample = (time: number) => {
      if (!video.paused && !video.seeking && !isPaused()) {
        const crossed =
          previous !== undefined &&
          (time >= previous
            ? previous < CURTAIN_MATCH && time >= CURTAIN_MATCH
            : previous < CURTAIN_MATCH || time >= CURTAIN_MATCH);
        if (crossed || Math.abs(time - CURTAIN_MATCH) < 1 / 48) {
          done(true);
          return;
        }
        previous = time;
      }
      schedule();
    };
    const schedule = () => {
      frame = useVideoFrames
        ? video.requestVideoFrameCallback((_now, metadata) => sample(metadata.mediaTime))
        : requestAnimationFrame(() => sample(video.currentTime));
    };
    // Measure visible, unpaused game time separately from video playback. A
    // decoder that stays paused or stops delivering frames still reaches this
    // fallback; opening the menu or hiding the tab does not spend the deadline.
    const deadline = setInterval(() => {
      const now = performance.now();
      if (!isPaused()) waited += now - lastTick;
      lastTick = now;
      if (waited >= CURTAIN_WAIT_MS) done(false);
    }, 25);
    signal.addEventListener('abort', abort, { once: true });
    video.addEventListener('error', fail, { once: true });
    schedule();
  });
}
