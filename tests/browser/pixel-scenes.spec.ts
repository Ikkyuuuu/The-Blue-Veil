import { test, expect } from '@playwright/test';

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
  await expect(page.locator('.interior-scene img')).toBeVisible();
  await page.locator('.interior-scene canvas').dispatchEvent('restore-test-context');
  await expect(page.locator('.interior-scene')).toHaveClass(/pixel-ready/);
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
  await page
    .getByRole('textbox', { name: 'Your question' })
    .fill('What can I learn from this project?');
  await page.getByRole('button', { name: 'Ask the reader' }).click();
  await expect(page.getByRole('button', { name: 'Draw card 1 of 3' })).toBeEnabled();
  await page.getByRole('button', { name: 'Draw card 1 of 3' }).click();
  await expect(page.locator('#spread img')).toHaveCount(1);
});
