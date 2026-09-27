import { test, expect, type Page } from '@playwright/test';

type AudioProbe = { voices: number; context?: AudioContext; master?: GainNode };
type AudioWindow = typeof window & { audioProbe: AudioProbe };
const voiceCount = (page: Page) => page.evaluate(() => (window as AudioWindow).audioProbe.voices);
async function expectQuiet(page: Page) {
  const counts = await page.evaluate(async () => {
    const before = (window as AudioWindow).audioProbe.voices;
    // Observe a quiet interval longer than two voice syllables.
    await new Promise((resolve) => setTimeout(resolve, 180));
    return [before, (window as AudioWindow).audioProbe.voices];
  });
  expect(counts[1]).toBe(counts[0]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Keep the real Web Audio graph; observe voice starts without replacing synthesis.
    const probe: AudioProbe = { voices: 0 };
    (window as AudioWindow).audioProbe = probe;
    const oscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      probe.context = this;
      const node = oscillator.call(this);
      const start = node.start.bind(node);
      node.start = (when?: number) => {
        if (node.type === 'square') probe.voices++;
        start(when);
      };
      return node;
    };
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const node = createGain.call(this);
      probe.master ??= node;
      return node;
    };
    // Scene playback is tested separately; leave only dialogue animated here.
    HTMLMediaElement.prototype.play = async function () {};
  });
});

test('sound starts on entry and reader blips respect mute, pause, skip and reduced motion', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Turn game sound off' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate(() => (window as AudioWindow).audioProbe.context)).toBeUndefined();
  await page.getByRole('button', { name: 'Enter the tent' }).click();
  expect(await voiceCount(page)).toBe(0);
  await expect
    .poll(() => page.evaluate(() => (window as AudioWindow).audioProbe.context?.state))
    .toBe('running');
  await expect
    .poll(() => page.evaluate(() => (window as AudioWindow).audioProbe.master?.gain.value))
    .toBeGreaterThan(0.9);
  await page
    .getByRole('textbox', { name: 'Your question' })
    .fill('What can I learn from a creative project?');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Ask the reader' }).click();
  await expect.poll(() => voiceCount(page)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Open game menu' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as AudioWindow).audioProbe.context?.state))
    .toBe('suspended');
  const pausedText = await page.locator('#dialogue').textContent();
  await expectQuiet(page);
  expect(await page.locator('#dialogue').textContent()).toBe(pausedText);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Turn game sound off' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as AudioWindow).audioProbe.master?.gain.value))
    .toBeLessThan(0.0001);
  const mutedCount = await voiceCount(page);
  await page.getByRole('button', { name: 'Draw card 1 of 3' }).click();
  await expect(page.getByRole('button', { name: 'Draw card 2 of 3' })).toBeEnabled();
  await expectQuiet(page);
  expect(await voiceCount(page)).toBe(mutedCount);

  await page.getByRole('button', { name: 'Turn game sound on' }).click();
  await page.getByRole('button', { name: 'Draw card 2 of 3' }).click();
  await page.getByRole('button', { name: 'Draw card 3 of 3' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'result');
  await expect(page.locator('#speech')).toHaveClass(/typing/);
  await expect.poll(() => voiceCount(page)).toBeGreaterThan(mutedCount);
  await page.locator('#dialogue').click();
  await expect(page.locator('#speech')).not.toHaveClass(/typing/);
  await expectQuiet(page);

  const beforeReduced = await voiceCount(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Continue reading', exact: true }).click();
  await expect(page.locator('#speech')).not.toHaveClass(/typing/);
  await expectQuiet(page);
  expect(await voiceCount(page)).toBe(beforeReduced);
  expect(errors).toEqual([]);
});

test('keyboard entry starts sound and muting before entry prevents automatic playback', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Space');
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as AudioWindow).audioProbe.context?.state))
    .toBe('running');

  // A resumed reading also waits for a gesture instead of starting audio on load.
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  expect(await page.evaluate(() => (window as AudioWindow).audioProbe.context)).toBeUndefined();
  await page.getByRole('textbox', { name: 'Your question' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as AudioWindow).audioProbe.context?.state))
    .toBe('running');

  await page.evaluate(() => sessionStorage.removeItem('blue-veil-entered'));
  await page.reload();
  await page.getByRole('button', { name: 'Turn game sound off' }).click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Enter the tent' }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Your question' }).press('a');
  expect(await page.evaluate(() => (window as AudioWindow).audioProbe.context)).toBeUndefined();
  await page.getByRole('button', { name: 'Turn game sound on' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as AudioWindow).audioProbe.context?.state))
    .toBe('running');
});
