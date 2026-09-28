import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Space enters real fullscreen on its first gesture and allows exiting', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#enter')).toBeVisible();
  const request = await page.evaluateHandle(() => {
    const state = { calls: 0, userActivation: false };
    const original = document.documentElement.requestFullscreen;
    document.documentElement.requestFullscreen = function (options) {
      state.calls++;
      state.userActivation = navigator.userActivation.isActive;
      return original.call(this, options);
    };
    return state;
  });

  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  expect(await request.jsonValue()).toEqual({ calls: 1, userActivation: true });
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  await expect(page.locator('#fullscreen-toggle')).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  const question = page.getByRole('textbox', { name: 'Your question' });
  await question.fill('My');
  await question.press('Space');
  await expect(question).toHaveValue('My ');
  expect(await request.jsonValue()).toEqual({ calls: 1, userActivation: true });
});

test('entering from the button preserves fullscreen when it is already active', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#enter')).toBeVisible();
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  // A second request is unnecessary and must not toggle fullscreen off.
  await page.evaluate(() => {
    document.documentElement.requestFullscreen = () => {
      throw new Error('Fullscreen was already active');
    };
  });
  await page.getByRole('button', { name: 'Enter the tent', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expect(page.locator('#toast')).toBeHidden();
});

test('F11 and the toolbar share fullscreen state and can both exit', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#enter')).toBeVisible();
  const button = page.locator('#fullscreen-toggle');
  await page.keyboard.press('F11');
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expect(button).toHaveAttribute('aria-label', 'Exit fullscreen');
  await button.click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(button).toHaveAttribute('aria-label', 'Enter fullscreen');
  await page.keyboard.press('F11');
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.keyboard.press('F11');
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(button).toHaveAttribute('aria-pressed', 'false');
});

test('browser-owned fullscreen gives an F11 exit hint without nesting fullscreen', async ({
  page,
}) => {
  // Emulate the browser-owned display mode, separate from document fullscreen.
  await page.addInitScript(() => {
    const original = window.matchMedia;
    window.matchMedia = function (query) {
      const media = original.call(this, query);
      if (query === '(display-mode: fullscreen)')
        Object.defineProperty(media, 'matches', { value: true });
      return media;
    };
    Element.prototype.requestFullscreen = () => {
      throw new Error('Browser fullscreen must not be nested');
    };
  });
  await page.goto('/');
  await expect(page.locator('#enter')).toBeVisible();
  const button = page.locator('#fullscreen-toggle');
  await expect(button).toHaveAttribute('aria-label', 'Exit fullscreen with F11');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.click();
  await expect(page.locator('#toast')).toHaveText('Press F11 to exit browser fullscreen.');
  // Do not cancel native F11: the browser must remain free to exit its mode.
  expect(
    await page.evaluate(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', cancelable: true })),
    ),
  ).toBe(true);
  await page.locator('#enter').focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
  await expect(button).toBeEnabled();
  await expect(page.locator('#toast')).toHaveText('Press F11 to exit browser fullscreen.');
});

for (const mode of ['blocked', 'unsupported'] as const) {
  test(`a browser with ${mode} fullscreen can still enter and play`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((value) => {
      if (value === 'unsupported') {
        Object.defineProperty(document, 'fullscreenEnabled', { value: false });
        Object.defineProperty(Element.prototype, 'requestFullscreen', { value: undefined });
      } else {
        Object.defineProperty(document, 'fullscreenEnabled', { value: true });
        Element.prototype.requestFullscreen = () =>
          Promise.reject(new DOMException('Blocked by the browser', 'NotAllowedError'));
      }
    }, mode);
    await page.goto('/');
    await page.getByRole('button', { name: 'Enter the tent', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
    await expect(page.locator('#toast')).toContainText(
      mode === 'blocked' ? 'Fullscreen was blocked' : 'Fullscreen is unavailable',
    );
    expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
    expect(errors).toEqual([]);
  });
}
