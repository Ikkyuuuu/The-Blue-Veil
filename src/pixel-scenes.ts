import { fragmentShader, vertexShader, PIXEL_SETTINGS } from './pixel-shader';

class PixelScene {
  readonly canvas = document.createElement('canvas');
  private gl: WebGLRenderingContext | null = null;
  private program?: WebGLProgram;
  private textures: WebGLTexture[] = [];
  private baseUploaded = false;
  private lastFrame = '';
  private lastSource = '';
  private sourceId = '';
  private previousSourceId = '';
  private motionUnit = 1;
  private blendStarted = -Infinity;
  private readonly blendDuration = 650;
  private lost = false;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private candles: HTMLElement[];

  constructor(
    private parent: HTMLElement,
    private poster: HTMLImageElement,
    private interior = false,
    private litPoster?: HTMLImageElement,
  ) {
    this.candles = Array.from(parent.querySelectorAll<HTMLElement>('.scene-candle'));
    this.canvas.className = 'scene-image pixel-scene';
    this.canvas.width = PIXEL_SETTINGS.width;
    this.canvas.height = PIXEL_SETTINGS.height;
    this.canvas.setAttribute('aria-hidden', 'true');
    parent.insertBefore(this.canvas, parent.querySelector('.orb-aura'));
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
      this.setRenderState('fallback');
    });
    this.canvas.addEventListener('webglcontextrestored', () => this.initialize());
    this.initialize();
  }

  private setRenderState(state: 'ready' | 'fallback') {
    this.parent.classList.toggle('pixel-ready', state === 'ready');
    this.parent.classList.toggle('pixel-fallback', state === 'fallback');
  }

  private initialize() {
    try {
      const gl = this.canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        powerPreference: 'low-power',
      });
      if (!gl) {
        this.setRenderState('fallback');
        return;
      }
      this.gl = gl;
      this.lost = false;
      this.baseUploaded = false;
      this.lastFrame = '';
      this.lastSource = '';
      this.sourceId = '';
      this.previousSourceId = '';
      this.motionUnit = 1;
      this.blendStarted = -Infinity;
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const message = gl.getShaderInfoLog(shader);
          gl.deleteShader(shader);
          throw new Error(message ?? 'Pixel shader compilation failed');
        }
        return shader;
      };
      const vertex = compile(gl.VERTEX_SHADER, vertexShader);
      const fragment = compile(gl.FRAGMENT_SHADER, fragmentShader);
      const program = gl.createProgram()!;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error('Pixel shader linking failed');
      this.program = program;
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0]),
        gl.STATIC_DRAW,
      );
      for (const [name, offset] of [
        ['position', 0],
        ['texCoord', 8],
      ] as const) {
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 16, offset);
      }
      const names = [
        'baseTexture',
        'motionTexture',
        'previousMotionTexture',
        'sourceBlend',
        'motionMix',
        'interiorMask',
        'resolution',
        'pixelSize',
        'ditherFactor',
        'edgeThreshold',
        'edgeIntensity',
        'edgeColor',
        'candles[0]',
      ];
      this.uniforms = Object.fromEntries(
        names.map((name) => [name, gl.getUniformLocation(program, name)]),
      );
      this.textures = [0, 1, 2].map((unit) => {
        const texture = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          1,
          1,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          new Uint8Array([0, 0, 0, 255]),
        );
        return texture;
      });
      const u = this.uniforms;
      gl.uniform1i(u.baseTexture, 0);
      gl.uniform1i(u.motionTexture, 1);
      gl.uniform1i(u.previousMotionTexture, 2);
      gl.uniform1f(u.sourceBlend, 1);
      gl.uniform1i(u.interiorMask, Number(this.interior));
      gl.uniform2f(u.resolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(u.pixelSize, PIXEL_SETTINGS.pixelSize);
      gl.uniform1f(u.ditherFactor, PIXEL_SETTINGS.ditherStrength);
      gl.uniform1f(u.edgeThreshold, PIXEL_SETTINGS.edgeThreshold);
      gl.uniform1f(u.edgeIntensity, PIXEL_SETTINGS.edgeIntensity);
      gl.uniform3f(u.edgeColor, ...PIXEL_SETTINGS.edgeColor);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    } catch {
      this.gl = null;
      this.setRenderState('fallback');
    }
  }

  draw(video?: HTMLVideoElement, presentedFrame?: number, now = performance.now()) {
    const gl = this.gl;
    if (!gl || this.lost || !this.poster.complete || !this.poster.naturalWidth) return;
    const ready = video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    // Loop seeks and clip loading can briefly drop readyState. Keep the last
    // uploaded video frame instead of flashing the differently lit still.
    const holdFrame = Boolean(video && !ready && this.sourceId.endsWith('-video'));
    const source = ready
      ? video
      : !holdFrame && this.litPoster?.naturalWidth
        ? this.litPoster
        : undefined;
    const nextSourceId = holdFrame
      ? this.sourceId
      : ready
        ? video.id
        : source
          ? 'lit-poster'
          : 'poster';
    const changedVideo =
      this.interior && ready && nextSourceId !== this.sourceId && this.sourceId.endsWith('-video');
    if (changedVideo) {
      // Retain the outgoing texture while the first real incoming frame loads.
      // A rapid switch back reverses an unfinished blend without a visual cut.
      const progress = Math.min(1, (now - this.blendStarted) / this.blendDuration);
      this.blendStarted =
        nextSourceId === this.previousSourceId && progress < 1
          ? now - (1 - progress) * this.blendDuration
          : now;
      this.previousSourceId = this.sourceId;
      this.motionUnit = this.motionUnit === 1 ? 2 : 1;
    } else if (nextSourceId !== this.sourceId) this.blendStarted = -Infinity;
    this.sourceId = nextSourceId;
    const progress = Math.min(1, Math.max(0, (now - this.blendStarted) / this.blendDuration));
    const blend = progress * progress * (3 - 2 * progress);
    const lights = this.candles.flatMap((candle) => {
      const style = getComputedStyle(candle);
      return [
        parseFloat(style.getPropertyValue('--candle-x')) / 100,
        parseFloat(style.getPropertyValue('--candle-y')) / 100,
        Number(style.opacity),
      ];
    });
    // Playback-quality counters can advance at only ~4 Hz for a hidden source
    // video. Frame callbacks signal that we consume every presented frame.
    const decodedFrame = ready ? (presentedFrame ?? video.currentTime) : 0;
    const sourceKey = holdFrame
      ? this.lastSource
      : ready
        ? `${video.id}:${decodedFrame || video.currentTime}`
        : nextSourceId;
    const key = `${sourceKey}:${lights}:${blend}`;
    if (this.lastFrame === key) return;
    try {
      gl.useProgram(this.program!);
      if (!this.baseUploaded) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[0]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.poster);
        this.baseUploaded = true;
      }
      if (source && this.lastSource !== sourceKey) {
        gl.activeTexture(gl.TEXTURE0 + this.motionUnit);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[this.motionUnit]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        this.lastSource = sourceKey;
      }
      gl.uniform1i(this.uniforms.motionTexture, this.motionUnit);
      gl.uniform1i(this.uniforms.previousMotionTexture, this.motionUnit === 1 ? 2 : 1);
      gl.uniform1f(this.uniforms.sourceBlend, blend);
      gl.uniform1f(this.uniforms.motionMix, source || holdFrame ? 1 : 0);
      if (this.interior) {
        gl.uniform3fv(this.uniforms['candles[0]'], lights);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.lastFrame = key;
      this.setRenderState('ready');
    } catch {
      // A temporary upload failure must not expose the unfiltered source.
      // Keep the last filtered frame (or the dark loading background) and retry.
      // Unavailable/lost graphics contexts select the explicit fallback above.
      this.lastFrame = '';
    }
  }
}

export function createPixelScenes() {
  const get = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
  const exteriorPoster = get<HTMLImageElement>('.exterior-scene img');
  const interiorPoster = get<HTMLImageElement>('.interior-scene img');
  const litPoster = new Image();
  litPoster.src = '/assets/scenes/interior.jpg';
  const scenes = {
    exterior: new PixelScene(get('.exterior-scene'), exteriorPoster),
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
