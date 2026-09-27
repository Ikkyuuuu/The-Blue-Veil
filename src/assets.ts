import { CARDS } from '../shared/cards';
import { createLoadingForest } from './loading-forest';

export const MUSIC_URL = '/assets/music/a-dragons-lullaby-2023.mp3';
export const FONT_URL = '/assets/fonts/VT323-Regular.ttf';

// The same allowlist drives startup and deployment. Only runtime artwork belongs here.
export const GAME_ASSETS = [
  FONT_URL,
  '/favicon.svg',
  '/assets/scenes/exterior.jpg',
  '/assets/scenes/exterior-master.mp4',
  '/assets/scenes/interior.jpg',
  '/assets/scenes/interior-unlit.png',
  '/assets/deck/back.png',
  ...CARDS.map((card) => card.image),
  '/assets/scenes/entrance-master.mp4',
  '/assets/scenes/interior-master.mp4',
  '/assets/scenes/reading-master.mp4',
  MUSIC_URL,
];

const loaded = new Map<string, { url: string; bytes: number }>();

// Retain compressed files for this page's lifetime, including bfcache restores.
// Video/audio elements can then seek without making more HTTP range requests.
export function assetUrl(path: string): string {
  return loaded.get(path.split('?')[0])?.url ?? path;
}

export async function loadGameAssets(root: HTMLElement) {
  root.innerHTML = `<main class="asset-loading" aria-labelledby="loading-title">
    <div class="world" aria-hidden="true"><div id="loading-forest" class="loading-forest"></div></div>
    <div class="loading-shade" aria-hidden="true"></div>
    <div class="loading-content"><div class="loading-orb" aria-hidden="true"></div>
    <h1 id="loading-title">The Blue Veil</h1>
    <p id="loading-status" role="status">Wandering through the forest…</p>
    <progress id="loading-progress" aria-label="Game assets downloaded" max="${GAME_ASSETS.length}" value="0"></progress>
    <p id="loading-count"></p><p class="loading-note">A blue light waits beyond the trees.<br>Loading every scene, card, and sound.</p>
    <button id="loading-retry" hidden>Retry loading</button></div></main>`;
  const progress = root.querySelector<HTMLProgressElement>('#loading-progress')!;
  const count = root.querySelector<HTMLElement>('#loading-count')!;
  const status = root.querySelector<HTMLElement>('#loading-status')!;
  const retry = root.querySelector<HTMLButtonElement>('#loading-retry')!;
  const forest = root.querySelector<HTMLElement>('#loading-forest')!;
  const forestView = createLoadingForest(forest);
  const partial = new Map<string, number>();
  let paint = 0;
  function render() {
    paint = 0;
    progress.value = loaded.size;
    const bytes =
      [...loaded.values()].reduce((sum, file) => sum + file.bytes, 0) +
      [...partial.values()].reduce((sum, bytes) => sum + bytes, 0);
    count.textContent = `${loaded.size} / ${GAME_ASSETS.length} assets · ${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  function update() {
    if (!paint) paint = requestAnimationFrame(render);
  }
  render();

  for (;;) {
    const attempt = new AbortController();
    const pending = GAME_ASSETS.filter((path) => !loaded.has(path));
    let next = 0;
    async function worker() {
      while (next < pending.length && !attempt.signal.aborted) {
        const path = pending[next++];
        // Reset on each chunk: a slow but progressing download may take minutes.
        let timeout: ReturnType<typeof setTimeout>;
        const touch = () => {
          clearTimeout(timeout);
          timeout = setTimeout(() => attempt.abort(), 90000);
        };
        touch();
        try {
          const response = await fetch(path, {
            signal: attempt.signal,
            cache: 'force-cache',
            credentials: 'omit',
          });
          const type = response.headers.get('content-type') ?? '';
          if (!response.ok || !response.body || type.includes('text/html'))
            throw new Error('Asset unavailable');
          const reader = response.body.getReader();
          const chunks: BlobPart[] = [];
          let bytes = 0;
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            touch();
            chunks.push(chunk.value);
            bytes += chunk.value.byteLength;
            partial.set(path, bytes);
            update();
          }
          if (!bytes) throw new Error('Empty asset');
          const blob = new Blob(chunks, { type });
          if (path === FONT_URL) {
            const font = new FontFace('VT323', await blob.arrayBuffer(), {
              weight: '400',
              style: 'normal',
            });
            await font.load();
            document.fonts.add(font);
          }
          const url = URL.createObjectURL(blob);
          try {
            if (path === '/assets/scenes/exterior.jpg') await forestView.show(url);
            if (path === '/assets/scenes/exterior-master.mp4') forestView.play(url);
            loaded.set(path, { url, bytes });
          } catch (error) {
            URL.revokeObjectURL(url);
            throw error;
          }
        } catch (error) {
          attempt.abort();
          throw error;
        } finally {
          clearTimeout(timeout!);
          partial.delete(path);
          update();
        }
      }
    }
    await Promise.allSettled(Array.from({ length: 4 }, worker));
    if (paint) cancelAnimationFrame(paint);
    render();
    if (loaded.size === GAME_ASSETS.length) break;
    status.textContent = 'A download was interrupted. Your loaded assets are saved for this retry.';
    retry.hidden = false;
    await new Promise<void>((resolve) =>
      retry.addEventListener('click', () => resolve(), { once: true }),
    );
    retry.hidden = true;
    status.textContent = 'Wandering through the forest…';
  }
  document.documentElement.style.setProperty(
    '--card-back',
    `url("${assetUrl('/assets/deck/back.png')}")`,
  );
  // Keep the living scene intact while main mounts the game. It adopts this same
  // element immediately afterward, including the running video and GPU textures.
  const veil = document.createElement('div');
  veil.className = 'loading-reveal';
  veil.append(forest.parentElement!);
  veil.setAttribute('aria-hidden', 'true');
  document.body.append(veil);
  return {
    adopt(placeholder: HTMLElement) {
      const scene = forestView.adopt(placeholder);
      veil.remove();
      return scene;
    },
  };
}
