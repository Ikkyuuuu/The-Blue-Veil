import { test, expect, type Page } from '@playwright/test';
import type { ReadingView } from '../../shared/cards';

async function observeRenderer(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('blue-veil-entered', '1');
    const locations = new WeakMap<WebGLUniformLocation, string>();
    const location = WebGLRenderingContext.prototype.getUniformLocation;
    WebGLRenderingContext.prototype.getUniformLocation = function (program, name) {
      const result = location.call(this, program, name);
      if (result) locations.set(result, name);
      return result;
    };
    const uniform = WebGLRenderingContext.prototype.uniform1f;
    WebGLRenderingContext.prototype.uniform1f = function (location, value) {
      const canvas = this.canvas as HTMLCanvasElement;
      if (canvas.closest('.interior-scene') && location) {
        const name = locations.get(location);
        if (name === 'motionMix') canvas.dataset.motionMix = String(value);
        if (name === 'sourceBlend' && value > 0 && value < 1)
          canvas.dataset[document.body.dataset.stage === 'pending' ? 'readingBlend' : 'idleBlend'] =
            'true';
      }
      uniform.call(this, location, value);
    };
    const upload = WebGLRenderingContext.prototype.texImage2D;
    WebGLRenderingContext.prototype.texImage2D = function (
      this: WebGLRenderingContext,
      ...args: unknown[]
    ) {
      const canvas = this.canvas as HTMLCanvasElement;
      const source = args.at(-1);
      if (canvas.closest('.interior-scene')) {
        if (source instanceof HTMLImageElement && source.src.endsWith('/interior.jpg'))
          canvas.dataset.posterUploads = String(Number(canvas.dataset.posterUploads ?? 0) + 1);
        if (source instanceof HTMLVideoElement) canvas.dataset.lastVideo = source.id;
      }
      Reflect.apply(upload, this, args);
    } as typeof upload;
  });
}

function readingFixture(): ReadingView {
  return {
    id: 'animation-preview',
    question: 'What can I reflect on?',
    status: 'drawing',
    cards: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
  };
}

async function mockSession(page: Page, reading: ReadingView) {
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        csrf: 'synthetic-test-token',
        remaining: 2,
        resetsAt: Date.now() + 86400000,
        activeReading: reading.id,
        latestReading: null,
        mode: 'local',
        deckSize: 78,
      },
    }),
  );
  await page.route(`**/api/readings/${reading.id}`, (route) => route.fulfill({ json: reading }));
}

test('a temporary loop or buffering gap retains the last video frame', async ({ page }) => {
  await observeRenderer(page);
  const reading = readingFixture();
  await mockSession(page, reading);
  await page.goto('/');
  const canvas = page.locator('.interior-scene canvas');
  await expect(canvas).toHaveAttribute('data-last-video', 'interior-video');
  const before = await canvas.getAttribute('data-poster-uploads');
  await page.locator('#interior-video').evaluate((element: HTMLVideoElement) => {
    element.pause();
    Object.defineProperty(element, 'readyState', { configurable: true, get: () => 0 });
    element.dispatchEvent(new Event('seeked'));
  });
  expect(await canvas.getAttribute('data-poster-uploads')).toBe(before);
  await expect(canvas).toHaveAttribute('data-motion-mix', '1');
  await expect(page.locator('.interior-scene')).toHaveClass(/pixel-ready/);
  // A deliberate reduced-motion setting still selects the lit still.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-poster-uploads')))
    .toBeGreaterThan(Number(before));
});

test('the reading clip waits for a frame and blends in and out without a still flash', async ({
  page,
}) => {
  test.setTimeout(90000);
  await observeRenderer(page);
  const reading = readingFixture();
  await mockSession(page, reading);
  const cards = [
    { id: 'the-fool', reversed: false },
    { id: 'the-sun', reversed: false },
    { id: 'judgement', reversed: false },
  ];
  await page.route(`**/api/readings/${reading.id}/draw`, (route) => {
    reading.cards.push(cards[reading.cards.length]);
    if (reading.cards.length === 3) reading.status = 'queued';
    return route.fulfill({ json: reading });
  });
  await page.goto('/');
  const canvas = page.locator('.interior-scene canvas');
  await expect(canvas).toHaveAttribute('data-last-video', 'interior-video');
  const before = await canvas.getAttribute('data-poster-uploads');
  await page.locator('#reading-video').evaluate((element) => {
    Object.defineProperty(element, 'readyState', { configurable: true, get: () => 0 });
  });
  for (let index = 1; index <= 3; index++)
    await page.getByRole('button', { name: `Draw card ${index} of 3` }).click();
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'pending');
  expect(await canvas.getAttribute('data-poster-uploads')).toBe(before);
  await expect(canvas).toHaveAttribute('data-motion-mix', '1');
  await page.locator('#reading-video').evaluate((element) => {
    Reflect.deleteProperty(element, 'readyState');
    element.dispatchEvent(new Event('loadeddata'));
  });
  await expect(canvas).toHaveAttribute('data-last-video', 'reading-video');
  await expect(canvas).toHaveAttribute('data-reading-blend', 'true');
  reading.status = 'complete';
  reading.answer = {
    cards: cards.map(({ id }) => ({ cardId: id, interpretation: 'Consider one practical step.' })),
    synthesis: 'Reflect on these possibilities.',
    reflection: 'What will you try?',
  };
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'result', { timeout: 20000 });
  await expect(canvas).toHaveAttribute('data-last-video', 'interior-video');
  await expect(canvas).toHaveAttribute('data-idle-blend', 'true');
  expect(await canvas.getAttribute('data-poster-uploads')).toBe(before);
});
