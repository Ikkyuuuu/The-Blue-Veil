import { test, expect } from '@playwright/test';

for (const finish of ['ended', 'skip'] as const) {
  test(`the exterior cannot leak through the entrance fade after ${finish}`, async ({ page }) => {
    // Exercise the real scene composition with stills, independent of decode speed.
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = async function () {};
    });
    await page.route('**/assets/scenes/*.mp4*', (route) => route.abort());
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
