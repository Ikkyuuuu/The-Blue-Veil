// The supplied master fades up from black during its first 16 frames (24 fps).
// Seek past that baked-in fade; the game blends from the currently visible tent.
export const ENTRANCE_START = 16 / 24;

function waitForFrame(video: HTMLVideoElement, ready: () => boolean) {
  return new Promise<void>((resolve, reject) => {
    const events = ['loadedmetadata', 'loadeddata', 'canplay', 'seeked'];
    const cleanup = () => {
      clearTimeout(timeout);
      events.forEach((event) => video.removeEventListener(event, check));
      video.removeEventListener('error', fail);
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
    const timeout = setTimeout(fail, 8000);
    events.forEach((event) => video.addEventListener(event, check));
    video.addEventListener('error', fail);
    if (video.error) fail();
    else check();
  });
}

export async function prepareEntrance(video: HTMLVideoElement) {
  video.pause();
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    video.preload = 'auto';
    video.load();
    await waitForFrame(video, () => video.readyState >= HTMLMediaElement.HAVE_METADATA);
  }
  video.currentTime = ENTRANCE_START;
  await waitForFrame(
    video,
    () => !video.seeking && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
  );
}
