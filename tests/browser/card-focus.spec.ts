import { test, expect } from '@playwright/test';
import { CARD_MAP, type ReadingView, type SessionView } from '../../shared/cards';

test('the explained card is centered, themed and follows reading navigation', async ({ page }) => {
  const reading: ReadingView = {
    id: 'focus-preview',
    question: 'How can I approach a new beginning?',
    status: 'complete',
    cards: [
      { id: 'death', reversed: true },
      { id: 'the-sun', reversed: false },
      { id: 'the-moon', reversed: false },
    ],
    answer: {
      cards: [
        {
          cardId: 'death',
          interpretation:
            'An ending can create room for growth. Give yourself time to acknowledge what has changed and choose what you want to carry forward. A gradual transition can be meaningful. You can take one small step today, then pause and consider what you learned before choosing the next.',
        },
        {
          cardId: 'the-sun',
          interpretation: 'Notice the small things that give you confidence and joy.',
        },
        { cardId: 'the-moon', interpretation: 'Leave room for uncertainty and listen patiently.' },
      ],
      synthesis: 'Together the cards invite a thoughtful beginning.',
      reflection: 'What is one small step you could take?',
    },
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
  };
  const session: SessionView = {
    csrf: 'synthetic-test-token',
    remaining: 2,
    resetsAt: Date.now() + 86400000,
    activeReading: null,
    latestReading: reading.id,
    mode: 'local',
    deckSize: 78,
  };
  await page.route('**/api/session', (route) => route.fulfill({ json: session }));
  await page.route('**/api/readings/focus-preview', (route) => route.fulfill({ json: reading }));
  await page.addInitScript(() => {
    sessionStorage.setItem('blue-veil-entered', '1');
    HTMLMediaElement.prototype.play = async function () {};
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const focus = page.locator('#card-focus');
  const image = page.locator('.focus-art img');
  await expect(focus).toBeVisible();
  await expect(focus).toHaveAttribute('data-card', 'death');
  await expect(focus).toHaveAttribute('data-tone', 'transformation');
  await expect(image).toHaveClass('reversed');
  await expect(image).toHaveAttribute('src', CARD_MAP.get('death')!.image);
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(1000);
  const box = (await focus.locator('.card-art').boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(1);
  if (viewport.width > viewport.height)
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(1);
  else {
    const speech = (await page.locator('#speech').boundingBox())!;
    expect(box.y + box.height).toBeLessThan(speech.y);
  }
  await page.screenshot({ path: `.private/qa/card-focus-${test.info().project.name}.png` });
  await image.evaluate((img) => img.setAttribute('data-same-page', 'yes'));
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(image).toHaveAttribute('data-same-page', 'yes');

  await page.getByRole('button', { name: 'Hear about The Sun', exact: true }).click();
  await expect(focus).toHaveAttribute('data-tone', 'joy');
  await expect(image).not.toHaveClass('reversed');
  await expect(image).toHaveAttribute('src', CARD_MAP.get('the-sun')!.image);
  await expect(focus).toHaveCSS('--aura-primary', '255 211 100');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(focus).toHaveAttribute('data-card', 'the-moon');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(focus).not.toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(focus).toBeVisible();
  await expect(focus).toHaveAttribute('data-tone', 'mystery');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Open game menu' }).click();
  await expect(page.locator('.focus-reveal')).toHaveCSS('animation-play-state', 'paused');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.focus-reveal')).toHaveCSS('animation-play-state', 'running');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.focus-reveal')).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Ask again', exact: true }).click();
  await expect(focus).not.toBeVisible();
  expect(errors).toEqual([]);
});
