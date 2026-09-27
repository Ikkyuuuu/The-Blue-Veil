import { test, expect, type Page } from '@playwright/test';

for (const scene of ['exterior', 'interior'] as const) {
  test(`reload keeps the ${scene} source hidden until its first filtered frame`, async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.exterior-scene')).toHaveClass(/pixel-ready/);
    if (scene === 'interior') {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.getByRole('button', { name: 'Enter the tent' }).click();
      await expect(page.locator('.interior-scene')).toHaveClass(/pixel-ready/);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }

    // Let the native video load, but hold the base texture needed by the shader.
    // This reproduces the raw video/poster flash even on a fast local connection.
    const poster = scene === 'exterior' ? 'exterior.jpg' : 'interior-unlit.png';
    let release!: () => void;
    const loading = new Promise<void>((resolve) => (release = resolve));
    await page.route(`**/assets/scenes/${poster}`, async (route) => {
      await loading;
      await route.continue();
    });
    const frame = page.locator(`.${scene}-scene`);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('.asset-loading')).toBeVisible();
      await expect(frame).toHaveCount(0);
      await page.screenshot({
        path: `.private/qa/${test.info().project.name}-${scene}-reload-loading.png`,
      });
    } finally {
      release();
    }
    await expect(frame).toHaveClass(/pixel-ready/);
    await expect(frame.locator('canvas')).toBeVisible();
    await expect(frame.locator('img')).toHaveCSS('visibility', 'hidden');
    await expect(frame.locator('video').first()).toHaveCSS('visibility', 'hidden');
    await page.screenshot({
      path: `.private/qa/${test.info().project.name}-${scene}-reload-ready.png`,
    });
  });
}

test('hidden video frames keep repainting when playback-quality counters are stale', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const quality = HTMLVideoElement.prototype.getVideoPlaybackQuality;
    HTMLVideoElement.prototype.getVideoPlaybackQuality = function () {
      const result = quality.call(this);
      Object.defineProperty(result, 'totalVideoFrames', { value: 1 });
      return result;
    };
    const draw = WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays = function (...args) {
      const canvas = this.canvas as HTMLCanvasElement;
      canvas.dataset.draws = String(Number(canvas.dataset.draws ?? 0) + 1);
      draw.apply(this, args);
    };
  });
  await page.goto('/');
  await expect(page.locator('.exterior-scene')).toHaveClass(/pixel-ready/);
  const draws = () =>
    page
      .locator('.exterior-scene canvas')
      .evaluate((canvas) => Number((canvas as HTMLElement).dataset.draws));
  const first = await draws();
  await expect.poll(draws).toBeGreaterThan(first + 3);
  await page.getByRole('button', { name: 'Open game menu' }).click();
  const paused = await draws();
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 250)));
  expect(await draws()).toBe(paused);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(draws).toBeGreaterThan(paused + 3);
});

async function candleFlames(page: Page) {
  const scene = (await page.locator('.interior-scene').boundingBox())!;
  const points = await page.locator('.scene-candle').evaluateAll((candles) =>
    candles.map((candle) => {
      const style = getComputedStyle(candle);
      return {
        x: parseFloat(style.getPropertyValue('--candle-x')) / 100,
        y: parseFloat(style.getPropertyValue('--candle-y')) / 100,
      };
    }),
  );
  const flames = [];
  for (const point of points) {
    const x = Math.max(0, Math.floor(scene.x + (point.x - 0.014) * scene.width));
    flames.push(
      await page.screenshot({
        clip: {
          x,
          y: Math.floor(scene.y + (point.y - 0.041) * scene.height),
          width: Math.min(Math.ceil(scene.width * 0.028), page.viewportSize()!.width - x),
          height: Math.ceil(scene.height * 0.039),
        },
      }),
    );
  }
  return flames;
}

test('original candle flames are filtered and extinguish independently', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const poster = page.waitForResponse((response) =>
    response.url().endsWith('/scenes/interior.jpg'),
  );
  await page.goto('/');
  await (await poster).finished();
  await page.getByRole('button', { name: 'Enter the tent' }).click();
  await expect(page.locator('.interior-scene')).toHaveClass(/pixel-ready/);
  // Only the filtered source artwork should supply the visible flames.
  for (const flame of await page.locator('.scene-candle').all()) await expect(flame).toBeHidden();
  let before = await candleFlames(page);
  for (let spent = 2; spent >= 0; spent--) {
    await page
      .getByRole('textbox', { name: 'Your question' })
      .fill(`What can I reflect on, ${spent}?`);
    await page.getByRole('button', { name: 'Ask the reader' }).click();
    await expect(page.locator('.scene-candle.extinguished')).toHaveCount(3 - spent);
    const after = await candleFlames(page);
    for (let index = 0; index < 3; index++)
      expect(after[index].equals(before[index])).toBe(index !== spent);
    before = after;
    await page.getByRole('button', { name: 'Open game menu' }).click();
    await page.locator('#release-reading').click();
  }
  await expect(page.locator('#dialogue')).toHaveText('You ask too much. Come back tomorrow.');
});

test('live pixel scenes, reduced motion and recovery after graphics loss', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.exterior-scene')).toHaveClass(/pixel-ready/);
  await page.getByRole('button', { name: 'Enter the tent' }).click();
  await page.getByRole('button', { name: 'Skip the walk' }).click();
  await expect(page.locator('.interior-scene')).toHaveClass(/pixel-ready/);
  const before = await page
    .locator('#interior-video')
    .evaluate((video: HTMLVideoElement) => video.currentTime);
  await expect
    .poll(() =>
      page.locator('#interior-video').evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .not.toBe(before);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => page.locator('#interior-video').evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(true);
  await expect(page.locator('.interior-scene canvas')).toBeVisible();

  await page.locator('.interior-scene canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl')!;
    const extension = gl.getExtension('WEBGL_lose_context')!;
    canvas.addEventListener(
      'webglcontextlost',
      () => {
        canvas.addEventListener('restore-test-context', () => extension.restoreContext(), {
          once: true,
        });
      },
      { once: true },
    );
    extension.loseContext();
  });
  await expect(page.locator('.interior-scene')).not.toHaveClass(/pixel-ready/);
  await expect(page.locator('.interior-scene')).toHaveClass(/pixel-fallback/);
  await expect(page.locator('.interior-scene img')).toBeVisible();
  await page.locator('.interior-scene canvas').dispatchEvent('restore-test-context');
  await expect(page.locator('.interior-scene')).toHaveClass(/pixel-ready/);
  await expect(page.locator('.interior-scene')).not.toHaveClass(/pixel-fallback/);
  await expect(page.locator('.interior-scene img')).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  await page.getByRole('button', { name: 'Open game menu' }).click();
  await page.getByRole('button', { name: 'The deck & credits' }).click();
  await expect(page.getByRole('link', { name: 'Video-to-Pixel-Art', exact: true })).toHaveAttribute(
    'href',
    'https://collidingscopes.github.io/video-to-pixel-art/',
  );
  const license = await page.request.get('/licenses/video-to-pixel-art-MIT.txt');
  expect(license.ok()).toBe(true);
  expect(await license.text()).toContain('Copyright (c) 2024 Alan Ang');
  expect(errors).toEqual([]);
});

test('the game remains playable when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === 'webgl') return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the tent' }).click();
  await expect(page.locator('.interior-scene img')).toBeVisible();
  await expect(page.locator('.interior-scene')).not.toHaveClass(/pixel-ready/);
  await expect(page.locator('.interior-scene')).toHaveClass(/pixel-fallback/);
  await page
    .getByRole('textbox', { name: 'Your question' })
    .fill('What can I learn from this project?');
  await page.getByRole('button', { name: 'Ask the reader' }).click();
  await expect(page.getByRole('button', { name: 'Draw card 1 of 3' })).toBeEnabled();
  await page.getByRole('button', { name: 'Draw card 1 of 3' }).click();
  await expect(page.locator('#spread img')).toHaveCount(1);
});
