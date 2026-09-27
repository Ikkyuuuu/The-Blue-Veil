import { PixelScene } from './pixel-scene';
import { PIXEL_SETTINGS } from './pixel-shader';
import { TENT_OUTLINE } from './tent-blur';

export function createLoadingForest(parent: HTMLElement) {
  const poster = new Image();
  poster.className = 'scene-image';
  poster.alt = '';
  const video = document.createElement('video');
  video.id = 'exterior-video';
  video.className = 'scene-image';
  video.muted = video.defaultMuted = video.loop = video.playsInline = true;
  video.preload = 'auto';
  parent.append(poster, video);
  const scene = new PixelScene(parent, poster);
  // Size the mask to the same covered image rectangle at every viewport size.
  // The CSS veil is only a no-WebGL fallback and the reveal's opacity clock.
  const veil = document.createElement('div');
  veil.className = 'loading-tent-veil';
  veil.style.clipPath = `polygon(${TENT_OUTLINE.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(',')})`;
  veil.style.setProperty('--scene-aspect', String(PIXEL_SETTINGS.width / PIXEL_SETTINGS.height));
  parent.append(veil);
  scene.setTentBlur(veil);
  const events = new AbortController();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let videoFrame: number | undefined;
  let lastTick = 0;
  const draw = (presentedFrame?: number) =>
    scene.draw(reduced.matches ? undefined : video, presentedFrame);
  const stop = () => {
    if (videoFrame !== undefined) video.cancelVideoFrameCallback(videoFrame);
    videoFrame = undefined;
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const schedule = () => {
    if (document.hidden || reduced.matches || videoFrame !== undefined || frame) return;
    if (typeof video.requestVideoFrameCallback === 'function') {
      videoFrame = video.requestVideoFrameCallback((_now, metadata) => {
        videoFrame = undefined;
        draw(metadata.presentedFrames);
        schedule();
      });
    } else {
      frame = requestAnimationFrame((now) => {
        frame = 0;
        if (now - lastTick >= 1000 / 24) {
          lastTick = now;
          draw();
        }
        schedule();
      });
    }
  };
  const playback = () => {
    stop();
    if (document.hidden || reduced.matches) video.pause();
    else if (video.src) void video.play().catch(() => undefined);
    draw();
    schedule();
  };
  for (const event of ['loadeddata', 'seeked'])
    video.addEventListener(event, () => draw(), { signal: events.signal });
  scene.canvas.addEventListener('webglcontextrestored', () => draw(), { signal: events.signal });
  document.addEventListener('visibilitychange', playback, { signal: events.signal });
  reduced.addEventListener('change', playback, { signal: events.signal });

  return {
    async show(url: string) {
      poster.src = url;
      video.poster = url;
      await poster.decode();
      draw();
      parent.classList.add('visible');
    },
    play(url: string) {
      video.src = url;
      playback();
    },
    adopt(placeholder: HTMLElement) {
      // Transfer ownership, never reset currentTime, replace the source or rebuild
      // the WebGL context. The game takes over frame scheduling in this same task.
      stop();
      events.abort();
      parent.removeAttribute('id');
      parent.classList.remove('loading-forest', 'visible');
      parent.classList.add(...placeholder.classList);
      placeholder.replaceWith(parent);
      const reveal = veil.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: reduced.matches ? 0 : 1000,
        fill: 'forwards',
      });
      void reveal.finished
        .catch(() => undefined)
        .then(() => {
          scene.setTentBlur();
          veil.remove();
          draw();
        });
      return scene;
    },
  };
}
