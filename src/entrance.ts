// The supplied master fades up from black during its first 16 frames (24 fps).
// Seek past that baked-in fade; the game blends from the currently visible tent.
export const ENTRANCE_START = 16 / 24;
// Compared over six consecutive frames: the curtain opening and movement here
// most closely match the clear beginning of the supplied walking clip.
export const CURTAIN_MATCH = 112 / 24;

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

export function waitForCurtainMatch(video: HTMLVideoElement, signal: AbortSignal) {
  signal.throwIfAborted();
  if (video.error || !video.videoWidth) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let previous: number | undefined;
    let frame = 0;
    let lastFrameAt = performance.now();
    const useVideoFrames = typeof video.requestVideoFrameCallback === 'function';
    const cleanup = () => {
      if (useVideoFrames) video.cancelVideoFrameCallback(frame);
      else cancelAnimationFrame(frame);
      clearInterval(stall);
      signal.removeEventListener('abort', abort);
      video.removeEventListener('error', done);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const sample = (time: number) => {
      if (time !== previous) lastFrameAt = performance.now();
      if (!video.paused && !video.seeking && !document.hidden) {
        const crossed =
          previous !== undefined &&
          (time >= previous
            ? previous < CURTAIN_MATCH && time >= CURTAIN_MATCH
            : previous < CURTAIN_MATCH || time >= CURTAIN_MATCH);
        if (crossed || Math.abs(time - CURTAIN_MATCH) < 1 / 48) {
          done();
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
    // A failed/stalled idle decoder must not trap the player outside. Pausing
    // the game doesn't count toward this fallback; Skip can also abort the wait.
    const stall = setInterval(() => {
      if (video.paused || document.hidden) lastFrameAt = performance.now();
      else if (performance.now() - lastFrameAt > 8000) done();
    }, 500);
    signal.addEventListener('abort', abort, { once: true });
    video.addEventListener('error', done, { once: true });
    schedule();
  });
}
