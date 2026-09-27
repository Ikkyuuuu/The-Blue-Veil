import { test, expect, type Page } from '@playwright/test';
import type { ReadingView } from '../../shared/cards';

type Probe = {
  audio?: HTMLMediaElement;
  gain?: GainNode;
  context?: AudioContext;
  sources: number;
  wraps: number;
};
type MusicWindow = typeof window & { musicProbe: Probe };
const song = '**/assets/music/a-dragons-lullaby-2023.mp3';
const clock = (page: Page) =>
  page.evaluate(() => (window as MusicWindow).musicProbe.audio?.currentTime ?? 0);
const gain = (page: Page) =>
  page.evaluate(() => (window as MusicWindow).musicProbe.gain?.gain.value ?? 0);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const probe: Probe = { sources: 0, wraps: 0 };
    (window as MusicWindow).musicProbe = probe;
    const create = AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createMediaElementSource = function (audio) {
      probe.audio = audio;
      probe.context = this;
      probe.sources++;
      let previous = 0;
      audio.addEventListener('timeupdate', () => {
        if (previous > 160 && audio.currentTime < 2) probe.wraps++;
        previous = audio.currentTime;
      });
      const node = create.call(this, audio),
        connect = node.connect;
      node.connect = function (this: MediaElementAudioSourceNode, ...args: unknown[]) {
        if (args[0] instanceof GainNode) probe.gain = args[0];
        return Reflect.apply(connect, this, args);
      } as typeof connect;
      return node;
    };
    // Keep native audio/video playback; the scene shader has separate coverage.
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) {
      if (String(args[0]).includes('webgl')) return null;
      return Reflect.apply(getContext, this, args);
    } as typeof getContext;
  });
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        csrf: 'synthetic-test',
        remaining: 3,
        resetsAt: Date.now() + 86400000,
        activeReading: null,
        latestReading: null,
        mode: 'local',
        deckSize: 78,
      },
    }),
  );
});

test('music loads inside the tent, pauses with controls, repeats softly and has credits', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('.mp3')) requests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#background-music')).toHaveCount(1);
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Enter the tent' }).click();
  await expect.poll(() => clock(page), { timeout: 12000 }).toBeGreaterThan(3);
  await expect.poll(() => gain(page)).toBeGreaterThan(0.14);
  expect(requests.length).toBeGreaterThan(0);
  expect(
    await page.locator('#background-music').evaluate((a: HTMLAudioElement) => a.error),
  ).toBeNull();

  await page.getByRole('button', { name: 'Turn game sound off' }).click();
  const mutedAt = await clock(page);
  await page.waitForTimeout(350);
  expect(await clock(page)).toBeCloseTo(mutedAt, 2);
  expect(await gain(page)).toBe(0);
  await page.getByRole('button', { name: 'Turn game sound on' }).click();
  await expect.poll(() => clock(page)).toBeGreaterThan(mutedAt + 0.2);

  await page.getByRole('button', { name: 'Open game menu' }).click();
  const pausedAt = await clock(page);
  await page.waitForTimeout(350);
  expect(await clock(page)).toBeCloseTo(pausedAt, 2);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(() => clock(page)).toBeGreaterThan(pausedAt + 0.2);

  // Simulate a hidden document while preserving native media and audio clocks.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenAt = await clock(page);
  await page.waitForTimeout(350);
  expect(await clock(page)).toBeCloseTo(hiddenAt, 2);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => clock(page)).toBeGreaterThan(hiddenAt + 0.2);

  await page.locator('#background-music').evaluate((a: HTMLAudioElement) => {
    a.currentTime = a.duration - 1.5;
  });
  await expect.poll(() => gain(page)).toBeLessThan(0.1);
  await expect.poll(() => page.evaluate(() => (window as MusicWindow).musicProbe.wraps)).toBe(1);
  await expect.poll(() => gain(page)).toBeGreaterThan(0.14);
  expect(await page.evaluate(() => (window as MusicWindow).musicProbe.sources)).toBe(1);
  await page.getByRole('button', { name: 'Open game menu' }).click();
  await page.locator('#about-deck').click();
  await expect(page.getByRole('link', { name: 'Scott Buckley', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'CC BY 4.0', exact: true })).toBeVisible();
  const notice = await page.request.get('/licenses/a-dragons-lullaby.txt');
  expect(notice.ok()).toBe(true);
  expect(await notice.text()).toContain("'A Dragon's Lullaby' by Scott Buckley");
});

test('music lowers during the orb and reader text, then returns after text is revealed', async ({
  page,
}) => {
  const reading: ReadingView = {
    id: 'music-preview',
    question: 'What could I learn?',
    status: 'queued',
    cards: ['the-fool', 'the-sun', 'judgement'].map((id) => ({ id, reversed: false })),
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
  };
  await page.addInitScript(() => sessionStorage.setItem('blue-veil-entered', '1'));
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
  await page.route('**/api/readings/music-preview', (route) => route.fulfill({ json: reading }));
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'pending');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => clock(page), { timeout: 12000 }).toBeGreaterThan(3);
  expect(await gain(page)).toBeGreaterThan(0.045);
  expect(await gain(page)).toBeLessThan(0.06);
  reading.status = 'complete';
  reading.answer = {
    cards: reading.cards.map((card) => ({
      cardId: card.id,
      interpretation:
        'Consider the possibilities in front of you. Give yourself time to reflect on what matters most, and choose a small step you can take with care.',
    })),
    synthesis: 'Reflect on these possibilities.',
    reflection: 'What will you try?',
  };
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'result', { timeout: 12000 });
  await expect(page.locator('#speech')).toHaveClass(/typing/);
  await expect.poll(() => gain(page)).toBeGreaterThan(0.062);
  expect(await gain(page)).toBeLessThan(0.09);
  await page.locator('#dialogue').click();
  await expect(page.locator('#speech')).not.toHaveClass(/typing/);
  await expect.poll(() => gain(page)).toBeGreaterThan(0.14);
});

test('muted entry and a slow music download do not block gameplay or pause/resume', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(song, async (route) => {
    requested = true;
    await held;
    await route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn game sound off' }).click();
  await page.getByRole('button', { name: 'Enter the tent' }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  expect(requested).toBe(false);
  await page.getByRole('button', { name: 'Turn game sound on' }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole('textbox', { name: 'Your question' }).fill('What could I learn?');
  await page.getByRole('button', { name: 'Open game menu' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  release();
  await expect.poll(() => clock(page)).toBeGreaterThan(0.5);
  await expect(page.getByRole('textbox', { name: 'Your question' })).toHaveValue(
    'What could I learn?',
  );
  expect(await page.evaluate(() => (window as MusicWindow).musicProbe.sources)).toBe(1);
});
