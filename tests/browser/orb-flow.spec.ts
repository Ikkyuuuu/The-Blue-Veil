import { test, expect, type Page } from '@playwright/test';
import type { ReadingView } from '../../shared/cards';

type Probe = {
  orb?: GainNode;
  master?: GainNode;
  context?: AudioContext;
  ends: number;
  wraps: number;
};
type OrbWindow = typeof window & { orbProbe: Probe };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('blue-veil-entered', '1');
    const probe: Probe = { ends: 0, wraps: 0 };
    (window as OrbWindow).orbProbe = probe;
    const connections = new WeakMap<AudioNode, AudioNode>();
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
      if (args[0] instanceof AudioNode) connections.set(this, args[0]);
      return Reflect.apply(connect, this, args);
    } as typeof connect;
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const gain = createGain.call(this);
      probe.master ??= gain;
      probe.context = this;
      return gain;
    };
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when?: number) {
      if (Math.abs(this.frequency.value - 523.9) < 0.01)
        probe.orb = connections.get(connections.get(this)!) as GainNode;
      start.call(this, when);
    };
    // These tests keep real media/audio clocks; shader blending has separate coverage.
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

async function fixture(page: Page, instant: boolean) {
  const cards = [
    { id: 'the-fool', reversed: false },
    { id: 'the-sun', reversed: false },
    { id: 'judgement', reversed: false },
  ];
  const reading: ReadingView = {
    id: 'orb-preview',
    question: 'What could I reflect on?',
    status: 'drawing',
    cards: cards.slice(0, 2),
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
  };
  const finish = () => {
    reading.status = 'complete';
    reading.answer = {
      cards: cards.map(({ id }) => ({
        cardId: id,
        interpretation:
          'Consider a small step, then give yourself time to reflect before moving forward.',
      })),
      synthesis: 'Reflect on the possibilities.',
      reflection: 'What will you try?',
    };
  };
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        csrf: 'synthetic-test',
        remaining: 2,
        resetsAt: Date.now() + 86400000,
        activeReading: reading.id,
        latestReading: null,
        mode: 'local',
        deckSize: 78,
      },
    }),
  );
  await page.route('**/api/readings/orb-preview', (route) => route.fulfill({ json: reading }));
  await page.route('**/api/readings/orb-preview/draw', (route) => {
    reading.cards = cards;
    reading.status = 'queued';
    if (instant) finish();
    return route.fulfill({ json: reading });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Draw card 3 of 3' })).toBeEnabled();
  await page.locator('#reading-video').evaluate((video: HTMLVideoElement) => {
    // Shorten wall-clock test time while retaining actual full media cycles.
    video.playbackRate = 2;
    let previous = 0;
    video.addEventListener('timeupdate', () => {
      if (video.currentTime < previous - 1) (window as OrbWindow).orbProbe.wraps++;
      previous = video.currentTime;
    });
    video.addEventListener('ended', () => (window as OrbWindow).orbProbe.ends++);
  });
  await page.getByRole('button', { name: 'Draw card 3 of 3' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'pending');
  await expect(page.locator('#continue-reading')).toBeHidden();
  await expect(page.locator('#previous-line')).toBeHidden();
  return { finish };
}

test('even an answer returned with the third card gets one full orb pass and a fading hum', async ({
  page,
}) => {
  await fixture(page, true);
  const video = page.locator('#reading-video');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.loop)).toBe(false);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(2);
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'pending');
  await expect
    .poll(() => page.evaluate(() => (window as OrbWindow).orbProbe.orb?.gain.value))
    .toBeGreaterThan(0.1);
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'result', { timeout: 12000 });
  expect(await page.evaluate(() => (window as OrbWindow).orbProbe.ends)).toBe(1);
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(8, 1);
  await expect(page.locator('#speech')).toHaveClass(/typing/);
  await expect(page.locator('#continue-reading')).toBeHidden();
  await expect(page.locator('#previous-line')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
  await expect(page.locator('#dialogue')).toHaveText(
    'Consider a small step, then give yourself time to reflect before moving forward.',
  );
  await expect(page.locator('#previous-line')).toBeHidden();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('#continue-reading')).toBeHidden();
  await expect(page.locator('#previous-line')).toBeHidden();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as OrbWindow).orbProbe.orb?.gain.value))
    .toBeLessThan(0.01);
  // Reopening a finished reading should not make the player repeat the ritual.
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'result');
  expect(await page.evaluate(() => (window as OrbWindow).orbProbe.ends)).toBe(0);
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(0);
});

test('slow answers wait for the current loop, including a paused result and sound toggles', async ({
  page,
}) => {
  const { finish } = await fixture(page, false);
  const video = page.locator('#reading-video');
  await expect
    .poll(() => page.evaluate(() => (window as OrbWindow).orbProbe.wraps), { timeout: 12000 })
    .toBeGreaterThan(0);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Open game menu' }).click();
  const pausedAt = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  finish();
  // Reconnect fetches the now-ready result while the animation is paused.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.loop)).toBe(false);
  await page.waitForTimeout(500);
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'pending');
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(pausedAt, 1);
  await expect
    .poll(() => page.evaluate(() => (window as OrbWindow).orbProbe.context?.state))
    .toBe('suspended');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Turn game sound off' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as OrbWindow).orbProbe.master?.gain.value))
    .toBeLessThan(0.0001);
  await page.getByRole('button', { name: 'Turn game sound on' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'result', { timeout: 12000 });
  expect(await page.evaluate(() => (window as OrbWindow).orbProbe.ends)).toBe(1);
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(8, 1);
});
