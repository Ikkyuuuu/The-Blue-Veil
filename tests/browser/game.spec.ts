import { test, expect, type Page } from '@playwright/test';

async function forgetFromMenu(page: Page) {
  await page.getByRole('button', { name: 'Open game menu' }).click();
  await page.locator('#release-reading').click();
}

test('scene, table draw, resume, paged reading and deletion', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Enter the tent' })).toBeVisible();
  await expect(page.locator('header,footer,.result-panel,.wordmark')).toHaveCount(0);
  await page.screenshot({
    path: `.private/qa/${test.info().project.name}-outside.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Enter the tent' }).click();
  await page.getByRole('button', { name: 'Skip the walk' }).click();
  await page
    .getByRole('textbox', { name: 'Your question' })
    .fill('How can I approach a new creative project?');
  const accepted = page.waitForResponse(
    (r) => r.url().endsWith('/api/readings') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Ask the reader' }).click();
  const { id } = await (await accepted).json();
  await page.getByRole('button', { name: 'Draw card 1 of 3' }).click();
  await expect(page.getByRole('button', { name: 'Draw card 2 of 3' })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Draw card 2 of 3' })).toBeEnabled();
  await page.locator('#dialogue').click();
  await page.screenshot({
    path: `.private/qa/${test.info().project.name}-draw.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Draw card 2 of 3' }).click();
  await page.getByRole('button', { name: 'Draw card 3 of 3' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'result', { timeout: 18000 });
  await expect(page.locator('#spread img')).toHaveCount(3);
  await expect(page.locator('#allowance-label')).toHaveText('2 QUESTIONS REMAINING');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({
    path: `.private/qa/${test.info().project.name}-result.png`,
    fullPage: true,
    animations: 'disabled',
  });
  const { answer } = await (await page.request.get(`/api/readings/${id}`)).json();
  const spoken: string[] = [];
  for (let step = 0; step < 30 && !(await page.locator('#result-choices').isVisible()); step++) {
    spoken.push(await page.locator('#dialogue').innerText());
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
  expect(normalize(spoken.join(' '))).toBe(
    normalize(
      [
        ...answer.cards.map((card: { interpretation: string }) => card.interpretation),
        answer.synthesis,
        answer.reflection,
      ].join(' '),
    ),
  );
  await expect(page.getByRole('button', { name: 'Ask again', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete this reading' }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  for (const path of [
    '/.private/dev-state.json',
    '/AWS_DISCOVERY.md',
    '/SECURITY_PLAN.md',
    '/.env',
    '/%2eprivate/dev-state.json',
    '/.git/config',
    '/server/game.ts',
  ])
    expect((await page.request.get(path)).status()).toBe(404);
  expect(errors).toEqual([]);
});

test('three physical candles and the persistent daily limit', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the tent' }).click();
  for (let index = 0; index < 3; index++) {
    await page
      .getByRole('textbox', { name: 'Your question' })
      .fill(`What can I reflect on today, question ${index + 1}?`);
    await page.getByRole('button', { name: 'Ask the reader' }).click();
    await expect(page.locator('.scene-candle.extinguished')).toHaveCount(index + 1);
    await forgetFromMenu(page);
  }
  await expect(page.locator('#dialogue')).toHaveText('You ask too much. Come back tomorrow.');
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeHidden();
  await page.reload();
  await expect(page.locator('#dialogue')).toHaveText('You ask too much. Come back tomorrow.');
  await expect(page.locator('.scene-candle.extinguished')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('keyboard input, Escape menu and untrusted text', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Space');
  const input = page.getByRole('textbox', { name: 'Your question' });
  await input.fill('<img src=x onerror=alert(1)> What should I consider?');
  let dialog = false;
  page.on('dialog', async (d) => {
    dialog = true;
    await d.dismiss();
  });
  await input.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'asking');
  await input.press('Enter');
  await expect(page.locator('#asked-question')).toHaveText(
    '<img src=x onerror=alert(1)> What should I consider?',
  );
  expect(dialog).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
  await page.getByRole('button', { name: 'Privacy & game rules' }).click();
  await expect(page.getByRole('heading', { name: 'Inside the tent' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#info-dialog')).not.toBeVisible();
  await forgetFromMenu(page);
});
