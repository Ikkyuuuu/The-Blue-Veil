import { test, expect } from '@playwright/test';

test('Space holds the idle scene until a clear frame is ready, then blends before walking', async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = async function () {
      this.dataset.playCalls = String(Number(this.dataset.playCalls ?? 0) + 1);
    };
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
  await entrance.evaluate((scene: HTMLElement) => {
    scene.addEventListener('transitionrun', () => {
      if (document.body.dataset.stage !== 'entering') return;
      for (const animation of scene.getAnimations()) {
        animation.pause();
        animation.currentTime = 0;
      }
      scene.dataset.held = 'true';
    });
  });
  const request = page.waitForRequest('**/assets/scenes/entrance-master.mp4*');
  await page.keyboard.press('Space');
  await request;
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'outside');
  await expect(entrance).toHaveCSS('opacity', '0');
  await expect(page.locator('.exterior-scene')).toHaveCSS('opacity', '1');
  release();
  await expect(entrance).toHaveAttribute('data-held', 'true');
  await expect(entrance).toHaveClass(/pixel-ready/);
  await expect(entrance).toHaveCSS('opacity', '0');
  const frame = await video.evaluate((element: HTMLVideoElement) => ({
    time: element.currentTime,
    decoded: element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !element.seeking,
    plays: Number(element.dataset.playCalls ?? 0),
  }));
  expect(frame.decoded).toBe(true);
  expect(frame.time).toBeCloseTo(2 / 3, 2);
  expect(frame.plays).toBe(0);
  await entrance.evaluate((scene) => {
    for (const animation of scene.getAnimations()) animation.currentTime = 1000;
  });
  await expect(entrance).toHaveCSS('opacity', '0.5');
  await expect(video).not.toHaveAttribute('data-play-calls');
  await page.getByRole('button', { name: 'Open game menu' }).click();
  const paused = await entrance.evaluate((scene) =>
    scene.getAnimations().every((animation) => animation.playState === 'paused'),
  );
  expect(paused).toBe(true);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(entrance).toHaveCSS('opacity', '1');
  await expect(video).toHaveAttribute('data-play-calls', /^[1-9]/);
  await page.getByRole('button', { name: 'Skip the walk' }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
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
