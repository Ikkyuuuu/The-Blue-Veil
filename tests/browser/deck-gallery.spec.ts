import { test, expect } from '@playwright/test';
import { CARDS, CARD_GROUPS } from '../../shared/cards';

test('the gallery browses all 78 selected cards by suit without loading them at startup', async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = async function () {};
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const faces: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/assets/deck/') && request.url().endsWith('.webp'))
      faces.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('#enter')).toBeVisible();
  expect(faces).toHaveLength(0);
  await page.getByRole('button', { name: 'Open game menu' }).click();
  await page.locator('#about-deck').click();
  await expect(page.getByRole('heading', { name: 'The Blue Veil deck' })).toBeVisible();
  for (const group of CARD_GROUPS) {
    await page.getByRole('button', { name: group.name, exact: true }).click();
    const cards = CARDS.filter((card) => card.group === group.id);
    const images = page.locator('#deck-gallery img');
    await expect(images).toHaveCount(cards.length);
    const dimensions = await page.locator('#deck-gallery .card-art').evaluateAll((elements) =>
      elements.map((element) => {
        const { width, height } = element.getBoundingClientRect();
        const image = element.querySelector('img')!;
        return { width, height, clip: getComputedStyle(image).clipPath };
      }),
    );
    for (const frame of dimensions) {
      expect(Math.abs(frame.width - dimensions[0].width)).toBeLessThan(1);
      expect(Math.abs(frame.height - dimensions[0].height)).toBeLessThan(1);
      expect(Math.abs(frame.width / frame.height - 128 / 180)).toBeLessThan(0.005);
      expect(frame.clip).toMatch(/^polygon\(/);
    }
    expect(await images.evaluateAll((imgs) => imgs.map((img) => img.getAttribute('src')))).toEqual(
      cards.map((card) => card.image),
    );
    const first = images.first();
    await first.scrollIntoViewIfNeeded();
    await expect
      .poll(() => first.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(1000);
    await expect(first).toHaveAttribute('loading', 'lazy');
  }
  await page.screenshot({ path: `.private/qa/generated-deck-${test.info().project.name}.png` });
});
