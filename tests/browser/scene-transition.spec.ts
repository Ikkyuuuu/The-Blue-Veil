import { test, expect } from '@playwright/test';

test('Space keeps curtains moving until their matching phase and through the blend', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Test native playback timing independently of software WebGL throughput.
    // The other transition checks exercise the filtered scene composition.
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
  let release!: () => void;
  const ready = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/assets/scenes/entrance-master.mp4*', async (route) => {
    await ready;
    await route.continue();
  });
  await page.goto('/');
  const entrance = page.locator('.entrance-scene');
  const video = page.locator('#entrance-video');
  const idle = page.locator('#exterior-video');
  await expect.poll(() => idle.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
  await idle.evaluate((v: HTMLVideoElement) => (v.currentTime = 2));
  await entrance.evaluate((scene: HTMLElement) => {
    scene.addEventListener('transitionrun', () => {
      if (document.body.dataset.stage !== 'entering') return;
      for (const animation of scene.getAnimations()) {
        animation.pause();
        animation.currentTime = 125;
      }
      scene.dataset.matchTime = String(
        (document.getElementById('exterior-video') as HTMLVideoElement).currentTime,
      );
      scene.dataset.held = 'true';
    });
  });
  const request = page.waitForRequest('**/assets/scenes/entrance-master.mp4*');
  await page.keyboard.press('Space');
  await request;
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'outside');
  await expect(entrance).toHaveCSS('opacity', '0');
  await expect(page.locator('.exterior-scene')).toHaveCSS('opacity', '1');
  const loadingTime = await idle.evaluate((v: HTMLVideoElement) => v.currentTime);
  await expect
    .poll(() => idle.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(loadingTime + 0.08);
  release();
  await expect(entrance).toHaveAttribute('data-held', 'true', { timeout: 12000 });
  expect(await video.evaluate((v: HTMLVideoElement) => v.readyState >= 2)).toBe(true);
  await expect(entrance).toHaveCSS('opacity', '0.5');
  const matchTime = Number(await entrance.getAttribute('data-match-time'));
  expect(matchTime).toBeGreaterThan(4.6);
  expect(matchTime).toBeLessThan(4.95);
  for (const clip of [idle, video]) {
    const start = await clip.evaluate((v: HTMLVideoElement) => v.currentTime);
    await expect
      .poll(() => clip.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(start + 0.08);
  }
  await page.getByRole('button', { name: 'Open game menu' }).click();
  const paused = await entrance.evaluate((scene) =>
    scene.getAnimations().every((animation) => animation.playState === 'paused'),
  );
  expect(paused).toBe(true);
  for (const clip of [idle, video])
    expect(await clip.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(entrance).toHaveCSS('opacity', '1');
  await expect.poll(() => idle.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await page.getByRole('button', { name: 'Skip the walk' }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
});

test('waiting for the next curtain cycle can be skipped without a late entrance', async ({
  page,
}) => {
  await page.goto('/');
  const idle = page.locator('#exterior-video');
  await expect.poll(() => idle.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
  await idle.evaluate((v: HTMLVideoElement) => (v.currentTime = 6));
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Skip the walk' })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('#entrance-video')
        .evaluate((v: HTMLVideoElement) => !v.seeking && v.currentTime > 0.6),
    )
    .toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'outside');
  await page.getByRole('button', { name: 'Skip the walk' }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  await idle.evaluate((v: HTMLVideoElement) => (v.currentTime = 4.67));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'asking');
  await expect(page.locator('.entrance-scene')).toHaveCSS('opacity', '0');
});

for (const finish of ['ended', 'skip'] as const) {
  test(`the exterior cannot leak through the entrance fade after ${finish}`, async ({ page }) => {
    // Exercise the real scene composition with stills, independent of decode speed.
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = async function () {};
    });
    await page.route('**/assets/scenes/*.mp4*', (route) =>
      route.request().url().includes('/entrance-master.mp4') ? route.continue() : route.abort(),
    );
    await page.goto('/');
    await page.getByRole('button', { name: 'Enter the tent' }).click();
    const entrance = page.locator('.entrance-scene');
    await expect(entrance).toHaveCSS('opacity', '1');
    if (finish === 'ended') await page.locator('#entrance-video').dispatchEvent('ended');
    else await page.getByRole('button', { name: 'Skip the walk' }).click();
    await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
    await page.locator('#speech').click();
    await page.locator('.world').evaluate((world) => {
      for (const animation of world.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = 1000;
      }
    });
    await expect(entrance).toHaveCSS('opacity', '0.5');
    await expect(page.locator('.exterior-scene')).toHaveCSS('opacity', '0');
    await expect(page.locator('.interior-scene')).toHaveCSS('opacity', '1');
    await expect(page.locator('.interior-scene')).toHaveClass(/pixel-ready/);
    const before = await page.screenshot({
      path: `.private/qa/entrance-fade-${test.info().project.name}-${finish}.png`,
    });
    // Removing the old tent entirely must not change even one composited pixel.
    await page.locator('.exterior-scene').evaluate((scene: HTMLElement) => {
      scene.style.display = 'none';
    });
    expect((await page.screenshot()).equals(before)).toBe(true);
    await entrance.evaluate((scene) => scene.getAnimations().forEach((a) => a.finish()));
    await expect(entrance).toHaveCSS('opacity', '0');
    await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  });
}
