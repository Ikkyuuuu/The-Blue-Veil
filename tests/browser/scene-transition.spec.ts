import { test, expect, type Page } from '@playwright/test';

async function nativePlayback(page: Page) {
  await page.addInitScript(() => {
    // Test native playback timing independently of software WebGL throughput.
    // The other transition checks exercise the filtered scene composition.
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === 'webgl') return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
}

test('Space keeps curtains moving until a nearby matching phase and through the blend', async ({
  page,
}) => {
  await nativePlayback(page);
  let release!: () => void;
  const ready = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/assets/scenes/entrance-master.mp4*', async (route) => {
    await ready;
    await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('.asset-loading')).toBeVisible();
  release();
  await expect(page.locator('#enter')).toBeVisible();
  const entrance = page.locator('.entrance-scene');
  const video = page.locator('#entrance-video');
  const idle = page.locator('#exterior-video');
  await expect.poll(() => idle.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => !v.seeking && v.readyState >= 2))
    .toBe(true);
  await entrance.evaluate((scene: HTMLElement) => {
    scene.addEventListener('transitionrun', () => {
      if (document.body.dataset.stage !== 'entering') return;
      for (const animation of scene.getAnimations()) {
        animation.pause();
        animation.currentTime = 125;
      }
      scene.dataset.matchTime = String(
        (document.getElementById('exterior-video') as HTMLVideoElement).currentTime,
      );
      scene.dataset.held = 'true';
    });
  });
  // Start the gesture in the seek callback so automation transport latency
  // cannot move us past the deliberately narrow matching window.
  await idle.evaluate(async (v: HTMLVideoElement) => {
    const sought = new Promise<void>((resolve) =>
      v.addEventListener('seeked', () => resolve(), { once: true }),
    );
    v.currentTime = 4.25;
    await sought;
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }),
    );
  });
  await expect(entrance).toHaveAttribute('data-held', 'true', { timeout: 12000 });
  expect(await video.evaluate((v: HTMLVideoElement) => v.readyState >= 2)).toBe(true);
  await expect(entrance).toHaveCSS('opacity', '0.5');
  const matchTime = Number(await entrance.getAttribute('data-match-time'));
  expect(matchTime).toBeGreaterThan(4.6);
  expect(matchTime).toBeLessThan(4.95);
  for (const clip of [idle, video]) {
    const start = await clip.evaluate((v: HTMLVideoElement) => v.currentTime);
    await expect
      .poll(() => clip.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(start + 0.08);
  }
  await page.getByRole('button', { name: 'Open game menu' }).click();
  const paused = await entrance.evaluate((scene) =>
    scene.getAnimations().every((animation) => animation.playState === 'paused'),
  );
  expect(paused).toBe(true);
  for (const clip of [idle, video])
    expect(await clip.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(entrance).toHaveCSS('opacity', '1');
  await expect.poll(() => idle.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await page.getByRole('button', { name: 'Skip the walk' }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
});

test('preparing the walk can be skipped without a late entrance', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#enter')).toBeVisible();
  const idle = page.locator('#exterior-video');
  await expect.poll(() => idle.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
  await idle.evaluate((v: HTMLVideoElement) => (v.currentTime = 6));
  // Skip in the same task, before either preparation or phase matching resolves.
  await page.evaluate(() => {
    document.getElementById('enter')!.click();
    document.getElementById('skip-entry')!.click();
  });
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  await idle.evaluate((v: HTMLVideoElement) => (v.currentTime = 4.67));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'asking');
  await expect(page.locator('.entrance-scene')).toHaveCSS('opacity', '0');
});

test('one Space starts the walk promptly while a slow session connects', async ({ page }) => {
  await nativePlayback(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let sessions = 0;
  await page.route('**/api/session', async (route) => {
    if (route.request().method() === 'POST') {
      sessions++;
      await held;
    }
    await route.continue();
  });
  try {
    await page.goto('/');
    await expect(page.locator('#enter')).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator('#entrance-video')
          .evaluate((v: HTMLVideoElement) => !v.seeking && v.readyState >= 2),
      )
      .toBe(true);
    await page.locator('#exterior-video').evaluate((v: HTMLVideoElement) => (v.currentTime = 6));
    const receipt = await page.evaluateHandle(() => {
      const state = { pressed: 0, started: 0, acknowledged: false };
      document.addEventListener('keydown', (event) => {
        if (event.code !== 'Space' || state.pressed) return;
        state.pressed = performance.now();
        state.acknowledged = !document.getElementById('entry-status')!.hidden;
      });
      new MutationObserver(() => {
        if (document.body.dataset.stage === 'entering' && !state.started)
          state.started = performance.now();
      }).observe(document.body, { attributes: true, attributeFilter: ['data-stage'] });
      return state;
    });
    await page.keyboard.press('Space');
    expect(await receipt.evaluate((state) => state.acknowledged)).toBe(true);
    await expect(page.locator('body')).toHaveAttribute('data-stage', 'entering', { timeout: 2500 });
    expect(await receipt.evaluate((state) => state.started - state.pressed)).toBeLessThan(1800);
    await expect(page.locator('.entrance-scene')).toHaveCSS('transition-duration', '0.65s');
    expect(sessions).toBe(1);
    await expect(page.locator('#question-form')).toBeHidden();
    // A held key must not immediately skip the walk on the next auto-repeat.
    await page.evaluate(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: ' ',
          code: 'Space',
          repeat: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await expect(page.locator('body')).toHaveAttribute('data-stage', 'entering');
    await page.getByRole('button', { name: 'Skip the walk' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-stage', 'asking');
    await expect(page.locator('#question-form')).toBeHidden();
    release();
    await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
    expect(sessions).toBe(1);
  } finally {
    release();
  }
});

test('a failed entry connection offers a working reconnect inside the tent', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let fail = true;
  await page.route('**/api/session', (route) =>
    fail
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      : route.continue(),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the tent' }).click();
  await expect(page.locator('#error-box')).toBeVisible();
  await expect(page.locator('#question-form')).toBeHidden();
  fail = false;
  await page.locator('#reconnect').click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  await expect(page.locator('#error-box')).toBeHidden();
});

for (const finish of ['ended', 'skip'] as const) {
  test(`the exterior cannot leak through the entrance fade after ${finish}`, async ({ page }) => {
    // Exercise the real scene composition with stills, independent of decode speed.
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = async function () {};
    });
    await page.goto('/');
    // Files must now load before boot. Simulate an unavailable idle decoder
    // after boot instead of aborting its required download. This skips phase
    // matching so the frozen-video fixture can test only the final fade.
    await expect(page.locator('#enter')).toBeVisible();
    await page.locator('#exterior-video').evaluate((video) => {
      Object.defineProperty(video, 'videoWidth', { value: 0 });
    });
    await page.getByRole('button', { name: 'Enter the tent' }).click();
    const entrance = page.locator('.entrance-scene');
    await expect(entrance).toHaveCSS('opacity', '1');
    if (finish === 'ended') await page.locator('#entrance-video').dispatchEvent('ended');
    else await page.getByRole('button', { name: 'Skip the walk' }).click();
    await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
    // Let the delayed question focus settle before freezing the composition;
    // otherwise a blinking caret can change an otherwise identical screenshot.
    await expect(page.getByRole('textbox', { name: 'Your question' })).toBeFocused();
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
    // Removing an invisible compositing layer can change a few antialiased
    // pixels in the SVG toolbar on mobile. Compare the scene, excluding controls.
    const mask = [page.locator('.game-controls')];
    const before = await page.screenshot({
      mask,
      path: `.private/qa/entrance-fade-${test.info().project.name}-${finish}.png`,
    });
    // Removing the old tent entirely must not change even one composited pixel.
    await page.locator('.exterior-scene').evaluate((scene: HTMLElement) => {
      scene.style.display = 'none';
    });
    const after = await page.screenshot({
      mask,
      path: `.private/qa/entrance-fade-${test.info().project.name}-${finish}-without-exterior.png`,
    });
    expect(after.equals(before)).toBe(true);
    await entrance.evaluate((scene) => scene.getAnimations().forEach((a) => a.finish()));
    await expect(entrance).toHaveCSS('opacity', '0');
    await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  });
}
