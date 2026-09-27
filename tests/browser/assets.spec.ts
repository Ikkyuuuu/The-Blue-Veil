import { test, expect } from '@playwright/test';
import { GAME_ASSETS, MUSIC_URL } from '../../src/assets';

test('forest holds entry for the last asset, then reuses every download', async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', (error) => errors.push(error.message));
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**${MUSIC_URL}`, async (route) => {
    await held;
    await route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loading-progress')).toHaveJSProperty(
    'value',
    GAME_ASSETS.length - 1,
    { timeout: 20000 },
  );
  await expect(page.locator('#loading-forest')).toHaveClass(/pixel-ready/);
  await expect(page.locator('#loading-forest')).toHaveClass(/visible/);
  await expect(page.locator('#loading-forest')).toHaveCSS('filter', 'none');
  await expect(page.locator('#loading-forest .pixel-scene')).toBeVisible();
  await expect(page.locator('.loading-tent-veil')).toHaveCSS('visibility', 'hidden');
  const palette = await page.evaluate(() => {
    const veil = document.querySelector<HTMLElement>('.loading-tent-veil')!;
    // Force a fresh still frame, then inspect it before WebGL presents the buffer.
    veil.style.opacity = '0.999';
    document.querySelector('#exterior-video')!.dispatchEvent(new Event('loadeddata'));
    const canvas = document.querySelector<HTMLCanvasElement>('#loading-forest .pixel-scene')!;
    const gl = canvas.getContext('webgl')!;
    const pixels = new Uint8Array(120 * 80 * 4);
    gl.readPixels(540, 330, 120, 80, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set<string>();
    for (let i = 0; i < pixels.length; i += 4)
      colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return { colors: colors.size, error: gl.getError() };
  });
  // A softened continuous gradient still resolves to the ten-color palette
  // (plus its ten possible black-edge shades), with visible dither variation.
  expect(palette.error).toBe(0);
  expect(palette.colors).toBeGreaterThan(1);
  expect(palette.colors).toBeLessThanOrEqual(20);
  // With motion reduced, toggling the tent mask changes only the center.
  // The trees and distant rides must keep the exact same rendered pixels.
  const viewport = page.viewportSize()!;
  const outside = { x: 10, y: 250, width: 100, height: 100 };
  const blurred = await page.screenshot({
    scale: 'css',
    path: `.private/qa/blur-on-${test.info().project.name}.png`,
  });
  const trees = viewport.width >= 800 ? await page.screenshot({ clip: outside }) : undefined;
  await page.locator('.loading-tent-veil').evaluate((el: HTMLElement) => {
    el.style.opacity = '0';
    document.querySelector('#exterior-video')!.dispatchEvent(new Event('loadeddata'));
  });
  const clear = await page.screenshot({
    scale: 'css',
    path: `.private/qa/blur-off-${test.info().project.name}.png`,
  });
  expect(clear.equals(blurred)).toBe(false);
  if (trees) expect((await page.screenshot({ clip: outside })).equals(trees)).toBe(true);
  await page.locator('.loading-tent-veil').evaluate((el: HTMLElement) => {
    el.style.opacity = '';
    document.querySelector('#exterior-video')!.dispatchEvent(new Event('loadeddata'));
  });
  await page.screenshot({
    scale: 'css',
    path: `.private/qa/loading-forest-${test.info().project.name}.png`,
  });
  await page.keyboard.press('Space');
  await expect(page.locator('#game, #background-music')).toHaveCount(0);
  expect(requests.filter((path) => path.startsWith('/api/'))).toHaveLength(0);
  release();
  await expect(page.locator('#enter')).toBeVisible({ timeout: 15000 });
  expect(GAME_ASSETS.every((path) => requests.includes(path))).toBe(true);
  // Block the network after boot. All four video sources, card images and the
  // music must remain usable from the downloaded bytes, not a fresh HTTP load.
  const before = requests.filter((path) => GAME_ASSETS.includes(path)).length;
  await page.route('**/assets/**', (route) => route.abort());
  await page.getByRole('button', { name: 'Enter the tent' }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  await expect
    .poll(() => page.locator('#background-music').evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0);
  for (const video of await page.locator('#game video').all())
    await expect(video).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: 'Open game menu' }).click();
  await page.locator('#about-deck').click();
  const cards = page.locator('#info-content .card-art img');
  for (const [suit, count] of [
    ['Major Arcana', 22],
    ['Wands', 14],
    ['Cups', 14],
    ['Swords', 14],
    ['Pentacles', 14],
  ] as const) {
    await page.getByRole('button', { name: suit, exact: true }).click();
    await expect(cards).toHaveCount(count);
    for (const card of await cards.all()) await expect(card).toHaveAttribute('src', /^blob:/);
  }
  expect(requests.filter((path) => GAME_ASSETS.includes(path)).length).toBe(before);
  expect(errors).toEqual([]);
});

test('retry keeps completed downloads and session restore waits for all assets', async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem('blue-veil-entered', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const counts = new Map<string, number>();
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    counts.set(path, (counts.get(path) ?? 0) + 1);
  });
  let fail = true;
  await page.route(`**${MUSIC_URL}`, (route) =>
    fail ? route.fulfill({ status: 503 }) : route.continue(),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Retry loading' })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#game')).toHaveCount(0);
  expect(counts.get('/api/session')).toBeUndefined();
  // Font/poster/card workers completed long before the final music failure.
  const card = GAME_ASSETS.find((path) => path.includes('/deck/') && !path.endsWith('/back.png'))!;
  expect(counts.get(card)).toBe(1);
  fail = false;
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible({
    timeout: 20000,
  });
  expect(counts.get(card)).toBe(1);
  expect(counts.get(MUSIC_URL)).toBe(2);
});

test('loading animation keeps its video, canvas, crop and playback phase when entry appears', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**${MUSIC_URL}`, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loading-progress')).toHaveJSProperty(
    'value',
    GAME_ASSETS.length - 1,
    { timeout: 20000 },
  );
  const video = page.locator('#exterior-video');
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0.5);
  await expect(page.locator('#loading-forest')).toHaveCSS('transform', 'none');
  await expect(page.locator('#loading-forest')).toHaveCSS('animation-name', 'none');
  const originals = await page.evaluateHandle(() => {
    const video = document.querySelector<HTMLVideoElement>('#exterior-video')!;
    const canvas = document.querySelector<HTMLCanvasElement>('#loading-forest .pixel-scene')!;
    let reloads = 0;
    video.addEventListener('loadstart', () => reloads++);
    return {
      video,
      canvas,
      rect: canvas.getBoundingClientRect().toJSON(),
      time: video.currentTime,
      clock: performance.now(),
      reloads: () => reloads,
    };
  });
  // Real movie time advances while the final asset is still held.
  await expect
    .poll(() =>
      originals.evaluate(
        ({ video, time }) => (video.currentTime - time + video.duration) % video.duration,
      ),
    )
    .toBeGreaterThan(0.4);
  await originals.evaluate((state) => {
    state.time = state.video.currentTime;
    state.clock = performance.now();
  });
  release();
  await expect(page.locator('#enter')).toBeVisible({ timeout: 15000 });
  const handoff = await originals.evaluate((state) => {
    const now = document.querySelector<HTMLVideoElement>('#exterior-video')!;
    const expected = (state.time + (performance.now() - state.clock) / 1000) % now.duration;
    const delta = Math.abs(now.currentTime - expected);
    return {
      sameVideo: state.video === now,
      sameCanvas: state.canvas === document.querySelector('.exterior-scene .pixel-scene'),
      oldRect: state.rect,
      rect: state.canvas.getBoundingClientRect().toJSON(),
      phaseError: Math.min(delta, now.duration - delta),
      reloads: state.reloads(),
      playing: !now.paused,
    };
  });
  expect(handoff.sameVideo).toBe(true);
  expect(handoff.sameCanvas).toBe(true);
  expect(handoff.rect).toEqual(handoff.oldRect);
  expect(handoff.phaseError).toBeLessThan(0.35);
  expect(handoff.reloads).toBe(0);
  expect(handoff.playing).toBe(true);
  await expect(page.locator('.loading-tent-veil')).toHaveCount(0);
  const after = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
  await expect
    .poll(() =>
      video.evaluate(
        (el: HTMLVideoElement, start) => (el.currentTime - start + el.duration) % el.duration,
        after,
      ),
    )
    .toBeGreaterThan(0.4);
  // Changing reduced-motion preference still hands playback to the game correctly.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(video).toHaveJSProperty('paused', true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(video).toHaveJSProperty('paused', false);
});
