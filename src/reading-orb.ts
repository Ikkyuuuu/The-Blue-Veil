// Let native playback define the boundary, rather than estimating it with an
// eight-second timeout. Disabling loop when an answer arrives finishes the
// current pass, including the first pass for a very fast answer.
export function createReadingOrb(
  video: HTMLVideoElement,
  sound: (active: boolean, phase: number) => void,
) {
  let active = false,
    paused = false,
    reduced = false,
    unavailable = false;
  let ready = false,
    boundary = false,
    buffering = true;
  let resolve: ((completed: boolean) => void) | undefined;
  let completion: Promise<boolean> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let attempt = 0,
    lastTime = 0,
    lastProgress = 0;

  const silence = () => sound(false, 0);
  const settle = (completed: boolean) => {
    active = false;
    attempt++;
    clearInterval(timer);
    video.pause();
    silence();
    resolve?.(completed);
    resolve = undefined;
  };
  const revealIfReady = () => {
    if (active && ready && !paused && (boundary || reduced || unavailable)) settle(true);
  };
  const fail = () => {
    if (!active) return;
    unavailable = true;
    clearInterval(timer);
    video.pause();
    silence();
    revealIfReady();
  };
  const tick = () => {
    if (!active || paused || reduced || unavailable) return;
    const now = performance.now(),
      time = video.currentTime;
    if (time !== lastTime) {
      lastProgress = now;
      lastTime = time;
    }
    const moving =
      !video.paused &&
      !video.seeking &&
      !buffering &&
      video.readyState >= 2 &&
      now - lastProgress < 350;
    sound(
      moving,
      Number.isFinite(video.duration) && video.duration > 0 ? time / video.duration : 0,
    );
    // A broken decoder must not trap a completed reading. Intentional pauses
    // never advance this watchdog; normal slow answers may loop indefinitely.
    if (now - lastProgress >= 12000) fail();
  };
  const play = () => {
    const request = ++attempt;
    void video.play().catch(() => {
      if (active && request === attempt && !paused && !reduced) fail();
    });
  };
  const sync = () => {
    attempt++;
    clearInterval(timer);
    if (!active) return;
    revealIfReady();
    if (!active) return;
    if (paused || reduced || unavailable) {
      video.pause();
      silence();
      return;
    }
    lastTime = video.currentTime;
    lastProgress = performance.now();
    play();
    timer = setInterval(tick, 100);
  };
  video.addEventListener('playing', () => {
    if (!active) return;
    buffering = false;
    lastProgress = performance.now();
    tick();
  });
  video.addEventListener('seeked', () => {
    if (active && !video.paused && video.readyState >= 2) {
      buffering = false;
      lastProgress = performance.now();
      tick();
    }
  });
  for (const event of ['waiting', 'seeking', 'pause'])
    video.addEventListener(event, () => {
      buffering = true;
      silence();
    });
  video.addEventListener('ended', () => {
    if (!active) return;
    boundary = true;
    silence();
    revealIfReady();
  });
  video.addEventListener('error', fail);

  return {
    start() {
      settle(false);
      completion = undefined;
      active = true;
      ready = boundary = false;
      buffering = true;
      unavailable = Boolean(video.error);
      video.loop = true;
      try {
        video.currentTime = 0;
      } catch {
        unavailable = true;
      }
      // The scene's visibility update starts playback after selecting this clip.
    },
    finish() {
      if (completion) return completion;
      if (!active) return Promise.resolve(false);
      ready = true;
      video.loop = false;
      completion = new Promise<boolean>((done) => {
        resolve = done;
      });
      revealIfReady();
      return completion;
    },
    update(nextPaused: boolean, nextReduced: boolean) {
      paused = nextPaused;
      reduced = nextReduced;
      sync();
    },
    cancel: () => settle(false),
  };
}
