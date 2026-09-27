import { test, expect, type Page } from '@playwright/test';
import type { ReadingView } from '../../shared/cards';

type Probe = { sounds: { duration: number; loop: boolean }[]; context?: AudioContext };
type AudioWindow = typeof window & { effectsProbe: Probe };
const sounds = (page: Page) => page.evaluate(() => (window as AudioWindow).effectsProbe.sounds);
const steps = async (page: Page) =>
  (await sounds(page)).filter((s) => Math.abs(s.duration - 0.32) < 0.001).length;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const probe: Probe = { sounds: [] };
    (window as AudioWindow).effectsProbe = probe;
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      probe.context = this;
      const node = create.call(this),
        start = node.start.bind(node);
      node.start = (...args: Parameters<typeof start>) => {
        probe.sounds.push({ duration: node.buffer?.duration ?? 0, loop: node.loop });
        start(...args);
      };
      return node;
    };
    // Keep actual media and audio playback; graphics are covered by renderer tests.
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) {
      if (String(args[0]).includes('webgl')) return null;
      return Reflect.apply(getContext, this, args);
    } as typeof getContext;
  });
});

async function sessionFixture(page: Page) {
  const session = {
    csrf: 'synthetic-test',
    remaining: 3,
    resetsAt: Date.now() + 86400000,
    activeReading: null as string | null,
    latestReading: null,
    mode: 'local',
    deckSize: 78,
  };
  await page.route('**/api/session', (route) => route.fulfill({ json: session }));
  return session;
}

test('inspecting cards sounds once per reveal and respects mute, pause and restoration', async ({
  page,
}) => {
  const session = await sessionFixture(page);
  const reading: ReadingView = {
    id: 'inspect-preview',
    question: 'What could I learn?',
    status: 'complete',
    cards: ['the-fool', 'the-sun', 'judgement'].map((id) => ({ id, reversed: false })),
    answer: {
      cards: ['the-fool', 'the-sun', 'judgement'].map((cardId) => ({
        cardId,
        interpretation: 'Consider one small step and give yourself time to reflect. '.repeat(5),
      })),
      synthesis: 'Take your time.',
      reflection: 'What matters most?',
    },
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
  };
  session.activeReading = reading.id;
  await page.route('**/api/readings/inspect-preview', (route) => route.fulfill({ json: reading }));
  await page.addInitScript(() => sessionStorage.setItem('blue-veil-entered', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const focus = page.locator('#card-focus');
  const count = async () =>
    (await sounds(page)).filter((s) => Math.abs(s.duration - 0.28) < 0.001).length;
  await expect(focus).toHaveAttribute('data-card', 'the-fool');
  expect(await count()).toBe(0);
  // The first gesture may be keyboard inspection of a restored reading.
  await page.getByRole('button', { name: 'Hear about The Sun', exact: true }).press('Enter');
  await expect.poll(count).toBe(1);
  await page.getByRole('button', { name: 'Hear about The Sun', exact: true }).click();
  expect(await count()).toBe(1);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(focus).toHaveAttribute('data-card', 'the-sun');
  expect(await count()).toBe(1);
  await page.getByRole('button', { name: 'Hear about The Fool', exact: true }).click();
  await expect.poll(count).toBe(2);
  await page.getByRole('button', { name: 'Turn game sound off' }).click();
  await page.getByRole('button', { name: 'Hear about Judgement', exact: true }).click();
  await expect(focus).toHaveAttribute('data-card', 'judgement');
  expect(await count()).toBe(2);
  await page.getByRole('button', { name: 'Turn game sound on' }).click();
  await page.getByRole('button', { name: 'Hear about The Sun', exact: true }).click();
  await expect.poll(count).toBe(3);
  await page.getByRole('button', { name: 'Open game menu' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as AudioWindow).effectsProbe.context?.state))
    .toBe('suspended');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  expect(await count()).toBe(3);
  await page.reload();
  await expect(focus).toHaveAttribute('data-card', 'the-fool');
  await page.locator('#dialogue').click();
  expect(await count()).toBe(0);
});

test('wind and footsteps follow the entrance, pause, mute, buffering and skip', async ({
  page,
}) => {
  await sessionFixture(page);
  await page.goto('/');
  expect(await sounds(page)).toEqual([]);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await sounds(page)).filter((s) => s.loop).length).toBe(1);
  expect(await steps(page)).toBe(0);
  await page.getByRole('button', { name: 'Enter the tent' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'entering');
  await expect.poll(() => steps(page)).toBeGreaterThan(1);

  await page.getByRole('button', { name: 'Open game menu' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as AudioWindow).effectsProbe.context?.state))
    .toBe('suspended');
  const paused = await steps(page);
  await page.waitForTimeout(700);
  expect(await steps(page)).toBe(paused);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(() => steps(page)).toBeGreaterThan(paused);

  // Simulate a decoder stall: media time stops, even though the game is entering.
  await page.locator('#entrance-video').evaluate((v: HTMLVideoElement) => v.pause());
  const stalled = await steps(page);
  await page.waitForTimeout(700);
  expect(await steps(page)).toBe(stalled);
  await page.locator('#entrance-video').evaluate((v: HTMLVideoElement) => v.play());
  await expect.poll(() => steps(page)).toBeGreaterThan(stalled);

  await page.getByRole('button', { name: 'Turn game sound off' }).click();
  const muted = await steps(page);
  await page.waitForTimeout(700);
  expect(await steps(page)).toBe(muted);
  await page.getByRole('button', { name: 'Turn game sound on' }).click();
  await expect.poll(() => steps(page)).toBeGreaterThan(muted);
  await page.getByRole('button', { name: 'Skip the walk' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'asking');
  const arrived = await steps(page);
  await page.waitForTimeout(700);
  expect(await steps(page)).toBe(arrived);
  expect((await sounds(page)).filter((s) => s.loop)).toHaveLength(1);
});

test('only successful question and draw actions sound, and restoring cards is silent', async ({
  page,
}) => {
  const session = await sessionFixture(page);
  const reading: ReadingView = {
    id: 'sound-preview',
    question: 'What could I learn?',
    status: 'drawing',
    cards: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
  };
  let rejectQuestion = true,
    rejectDraw = true;
  const failure = {
    status: 503,
    json: { error: { code: 'UNAVAILABLE', message: 'Please try again.' } },
  };
  await page.route('**/api/readings', (route) => {
    if (rejectQuestion) return route.fulfill(failure);
    session.remaining = 2;
    session.activeReading = reading.id;
    return route.fulfill({ json: reading });
  });
  await page.route(`**/api/readings/${reading.id}`, (route) => route.fulfill({ json: reading }));
  await page.route(`**/api/readings/${reading.id}/draw`, (route) => {
    if (rejectDraw) return route.fulfill(failure);
    reading.cards.push({ id: reading.cards.length ? 'the-sun' : 'the-fool', reversed: false });
    return route.fulfill({ json: reading });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the tent' }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  expect((await sounds(page)).filter((s) => !s.loop)).toHaveLength(0);
  await page.getByRole('textbox', { name: 'Your question' }).fill(reading.question);
  await page.getByRole('button', { name: 'Ask the reader' }).click();
  await expect(page.locator('#error-box')).toBeVisible();
  expect((await sounds(page)).filter((s) => !s.loop)).toHaveLength(0);
  rejectQuestion = false;
  await page.getByRole('button', { name: 'Ask the reader' }).click();
  await expect(page.getByRole('button', { name: 'Draw card 1 of 3' })).toBeEnabled();
  await expect(page.locator('.scene-candle.extinguished')).toHaveCount(1);
  expect((await sounds(page)).filter((s) => !s.loop).map((s) => s.duration)).toEqual([0.65]);
  await page.getByRole('button', { name: 'Draw card 1 of 3' }).click();
  await expect(page.locator('#error-box')).toBeVisible();
  expect((await sounds(page)).filter((s) => !s.loop)).toHaveLength(1);
  rejectDraw = false;
  await page.getByRole('button', { name: 'Draw card 1 of 3' }).click();
  await expect(page.getByRole('button', { name: 'Draw card 2 of 3' })).toBeEnabled();
  expect((await sounds(page)).filter((s) => !s.loop).map((s) => s.duration)).toEqual([
    0.65, 0.48, 0.12,
  ]);
  await page.getByRole('button', { name: 'Turn game sound off' }).click();
  await page.getByRole('button', { name: 'Draw card 2 of 3' }).click();
  await expect(page.getByRole('button', { name: 'Draw card 3 of 3' })).toBeEnabled();
  expect((await sounds(page)).filter((s) => !s.loop)).toHaveLength(3);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Draw card 3 of 3' })).toBeEnabled();
  await page.locator('#dialogue').click();
  await expect.poll(async () => (await sounds(page)).filter((s) => s.loop).length).toBe(1);
  expect((await sounds(page)).filter((s) => !s.loop)).toHaveLength(0);
});
