import { test, expect } from '@playwright/test';

test('cards leave the stack once and settle after pause, resize or reduced motion', async ({
  page,
}) => {
  // Isolate card movement from video decoding; the scene renderer has its own tests.
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = async function () {};
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  let draws = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/draw')) draws++;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the tent' }).click();
  await page
    .getByRole('textbox', { name: 'Your question' })
    .fill('How can I approach a new project?');
  await page.getByRole('button', { name: 'Ask the reader' }).click();
  await expect(page.locator('.deck-layer')).toHaveCount(8);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.getByRole('button', { name: 'Draw card 1 of 3' }).click();
  await expect(page.locator('.dealing')).toHaveCount(1);
  await page.locator('.dealing').evaluate((slot) => {
    for (const animation of slot.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 0;
    }
  });
  const start = (await page.locator('.dealing').boundingBox())!;
  const deck = (await page.locator('#deck img').boundingBox())!;
  for (const key of ['x', 'y', 'width', 'height'] as const)
    expect(Math.abs(start[key] - deck[key])).toBeLessThan(3);
  await expect(page.locator('#deck')).toBeDisabled();
  await page.locator('#deck').evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  expect(draws).toBe(1);
  const cardImage = page.locator('.dealing .tarot-card img');
  const originalSource = await cardImage.getAttribute('src');
  const originalOrientation = await cardImage.getAttribute('class');
  const seekDeal = async (progress: number) => {
    await page.locator('.dealing').evaluate((slot, progress) => {
      for (const animation of slot.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = Number(animation.effect!.getTiming().duration) * progress;
      }
    }, progress);
  };
  await seekDeal(0.42);
  const resting = (await page.locator('.deal-card').boundingBox())!;
  await page.screenshot({ path: `.private/qa/card-flip-${test.info().project.name}-back.png` });
  await seekDeal(0.67);
  const turning = (await page.locator('.deal-card').boundingBox())!;
  // The rigid card rises above the cloth and presents its edge during the turn.
  expect(turning.y).toBeLessThan(resting.y - 5);
  expect(turning.width).toBeLessThan(resting.width * 0.65);
  await page.screenshot({ path: `.private/qa/card-flip-${test.info().project.name}-edge.png` });
  await seekDeal(0.85);
  await page.screenshot({ path: `.private/qa/card-flip-${test.info().project.name}-face.png` });
  await page.getByRole('button', { name: 'Open game menu' }).click();
  expect(
    await page
      .locator('.dealing')
      .evaluate((slot) =>
        slot
          .getAnimations({ subtree: true })
          .every((animation) => animation.playState === 'paused'),
      ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Draw card 2 of 3' })).toBeEnabled();
  await expect(page.locator('.deal-card, .deal-shadow, .deal-light')).toHaveCount(0);
  const settledImage = page.locator('#spread .tarot-card img');
  await expect(settledImage).toHaveCount(1);
  await expect(settledImage).toHaveAttribute('src', originalSource!);
  expect(await settledImage.getAttribute('class')).toBe(originalOrientation);

  await page.getByRole('button', { name: 'Draw card 2 of 3' }).click();
  await expect(page.locator('.dealing')).toHaveCount(1);
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width - 30, height: viewport.height });
  await expect(page.getByRole('button', { name: 'Draw card 3 of 3' })).toBeEnabled();
  await expect(page.locator('.deal-back')).toHaveCount(0);

  await page.getByRole('button', { name: 'Draw card 3 of 3' }).click();
  await expect(page.locator('.dealing')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.dealing, .deal-back')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'result');
  expect(draws).toBe(3);
  await page.reload();
  await expect(page.locator('#spread img')).toHaveCount(3);
  await expect(page.locator('.dealing, .deal-back')).toHaveCount(0);
  expect(errors).toEqual([]);
});
