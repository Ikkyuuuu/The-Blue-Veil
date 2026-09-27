import { assetUrl } from './assets';
import { PixelScene } from './pixel-scene';

export function createPixelScenes(exteriorScene?: PixelScene) {
  const get = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
  const exteriorPoster = get<HTMLImageElement>('.exterior-scene img');
  const interiorPoster = get<HTMLImageElement>('.interior-scene img');
  const litPoster = new Image();
  litPoster.src = assetUrl('/assets/scenes/interior.jpg');
  const scenes = {
    exterior: exteriorScene ?? new PixelScene(get('.exterior-scene'), exteriorPoster),
    interior: new PixelScene(get('.interior-scene'), interiorPoster, true, litPoster),
    entrance: new PixelScene(get('.entrance-scene'), exteriorPoster),
  };
  const videos = {
    exterior: get<HTMLVideoElement>('#exterior-video'),
    interior: get<HTMLVideoElement>('#interior-video'),
    reading: get<HTMLVideoElement>('#reading-video'),
    entrance: get<HTMLVideoElement>('#entrance-video'),
  };
  let stage = 'outside',
    entranceBlending = false,
    paused = false,
    reduced = false,
    frame = 0,
    candleFrame = 0,
    lastTick = 0;
  let videoFrame: { video: HTMLVideoElement; id: number } | undefined;
  const presentedFrames = new WeakMap<HTMLVideoElement, number>();
  let sceneTime = 0;
  let lastClock = performance.now();
  const clock = () => {
    const now = performance.now();
    if (!paused) sceneTime += now - lastClock;
    lastClock = now;
    return sceneTime;
  };
  const activeVideo = () =>
    stage === 'outside'
      ? videos.exterior
      : stage === 'entering'
        ? videos.entrance
        : stage === 'pending'
          ? videos.reading
          : videos.interior;
  const draw = () => {
    const scene =
      stage === 'outside'
        ? scenes.exterior
        : stage === 'entering'
          ? scenes.entrance
          : scenes.interior;
    const video = activeVideo();
    scene.draw(reduced ? undefined : video, presentedFrames.get(video), clock());
    // Only the brief entrance overlap needs a second moving scene. Use its
    // current timestamp because frame callbacks now belong to the walking clip.
    if (stage === 'entering' && entranceBlending)
      scenes.exterior.draw(reduced ? undefined : videos.exterior);
  };
  const tick = (now: number) => {
    frame = 0;
    // Compatibility path for browsers without video-frame callbacks.
    if (now - lastTick >= 1000 / 24) {
      lastTick = now;
      draw();
    }
    if (!paused && !reduced) frame = requestAnimationFrame(tick);
  };
  const schedule = () => {
    if (paused || reduced || videoFrame || frame) return;
    const video = activeVideo();
    if (typeof video.requestVideoFrameCallback === 'function') {
      const id = video.requestVideoFrameCallback((_now, metadata) => {
        videoFrame = undefined;
        presentedFrames.set(video, metadata.presentedFrames);
        draw();
        schedule();
      });
      videoFrame = { video, id };
    } else frame = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (videoFrame) videoFrame.video.cancelVideoFrameCallback(videoFrame.id);
    videoFrame = undefined;
    cancelAnimationFrame(frame);
    cancelAnimationFrame(candleFrame);
    frame = candleFrame = 0;
  };
  const update = (
    nextStage: string,
    nextPaused: boolean,
    nextReduced: boolean,
    blending = false,
  ) => {
    stop();
    clock(); // Account for elapsed play time before changing the paused state.
    stage = nextStage;
    paused = nextPaused;
    reduced = nextReduced;
    entranceBlending = blending;
    draw();
    schedule();
  };
  for (const image of [exteriorPoster, interiorPoster, litPoster])
    image.addEventListener('load', draw);
  for (const video of Object.values(videos)) {
    video.addEventListener('loadeddata', draw);
    video.addEventListener('seeked', draw);
  }
  for (const scene of Object.values(scenes))
    scene.canvas.addEventListener('webglcontextrestored', draw);
  // Quota updates must redraw even while playback is paused or motion is reduced.
  const candleChanges = new MutationObserver(() => {
    draw();
    // A paused video has no frame callbacks to animate the short opacity fade.
    // Reduced-motion candles settle immediately and only need the redraw above.
    if (reduced || document.hidden) return;
    cancelAnimationFrame(candleFrame);
    const until = performance.now() + 850;
    let last = 0;
    const fade = (now: number) => {
      candleFrame = 0;
      if (now - last >= 1000 / 24 || now >= until) {
        last = now;
        draw();
      }
      if (now < until && !document.hidden) candleFrame = requestAnimationFrame(fade);
    };
    candleFrame = requestAnimationFrame(fade);
  });
  for (const candle of document.querySelectorAll('.scene-candle'))
    candleChanges.observe(candle, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('pagehide', stop);
  return {
    update,
    prepareEntrance: () => scenes.entrance.draw(videos.entrance),
  };
}
