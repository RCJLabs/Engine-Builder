/**
 * The 3D spike (M1.10) as Pages serves it, beside the editor. Headless Chromium draws it in
 * software (SwiftShader's WebGL2), so these tests prove it works, never how fast: the frame
 * rates that count come from a phone.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';

const SPIKE = 'spikes/3d/';

// Chrome is retiring its silent fall back to software WebGL; this is the opt-in it asks for.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } });

const framesDrawn = async (page: Page) =>
  Number(await page.locator('[data-stat="frames"]').getAttribute('data-frames'));

/** Every link and button at least 44 px each way. */
async function expectTouchTargets(page: Page): Promise<void> {
  const small = await page.locator('a:visible, button:visible').evaluateAll((els) =>
    els
      .map((el) => ({ name: el.textContent, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .map(({ name, box }) => `${name} ${Math.round(box.width)}×${Math.round(box.height)}`),
  );
  expect(small, 'touch targets under 44 px').toEqual([]);
}

test.describe('3D spike, desktop 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('draws the scene and stands Rapier on the drawn ground', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${SPIKE}?tier=low`);
    await expect(page.getByRole('heading', { name: '3D spike' })).toBeVisible();
    await expect(page.locator('[data-stat="backend"]')).toHaveText(/^(WebGPU|WebGL2) · low tier$/);
    await expect(page.getByRole('link', { name: 'Low' })).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => framesDrawn(page), { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.locator('[data-stat="physics"]')).toContainText('64 rays land on the drawn ground', {
      timeout: 30_000,
    });
    expect(errors).toEqual([]);
  });

  // The editor's worker answers every navigation in its scope with the editor, unless told not to.
  test('opens beside an installed editor, not as the editor', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await page.goto(`${SPIKE}?tier=low`);
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'the worker saw this load').toBe(
      true,
    );
    await expect(page.getByRole('heading', { name: '3D spike' })).toBeVisible();
    await expect(page.locator('.shell')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

const PHONES: readonly (readonly [width: number, height: number])[] = [
  [390, 844],
  [844, 390],
];

for (const [width, height] of PHONES) {
  test.describe(`3D spike, phone ${width}×${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true });

    test('keeps the overlay on screen, with 44 px targets', async ({ page }) => {
      // Its first frame alone may take the 30 s its poll allows.
      test.setTimeout(60_000);
      const errors = watchErrors(page);
      await page.goto(`${SPIKE}?tier=medium`);
      await expect.poll(() => framesDrawn(page), { timeout: 30_000 }).toBeGreaterThan(0);
      await expectNothingOffscreen(page);
      await expectTouchTargets(page);
      await expectNoAxeIssues(page);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('3D spike, phone 360×740', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });

  test('measures each tier on its own page load and ends with a reading to copy', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await page.goto(`${SPIKE}?tier=high&warmup=0.2&measure=1.5`);
    // The page's own test: WebGPU counts only with an adapter behind it.
    const webgpu = await page.evaluate(async () =>
      Boolean(await (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu?.requestAdapter()),
    );
    await page.getByRole('button', { name: 'Measure all tiers' }).tap();
    await page.waitForURL(/\?done=1$/, { timeout: 100_000 });

    const reading = page.getByRole('textbox', { name: 'The reading, to copy' });
    await expect(reading).toBeVisible();
    const lines = (await reading.inputValue()).split('\n');
    expect(lines.slice(0, 4).map((line) => line.split(':')[0])).toEqual([
      expect.stringMatching(/^3D spike reading, \d{4}-\d{2}-\d{2}$/),
      'Device',
      'Screen',
      'Protocol',
    ]);
    const backends = webgpu ? ['webgpu', 'webgl'] : ['webgl'];
    const steps = backends.flatMap((backend) => ['low', 'medium', 'high'].map((tier) => `${tier} on ${backend}`));
    const results = lines.slice(4, 4 + steps.length);
    expect(results.map((line) => line.split(' at ')[0])).toEqual(steps);
    for (const line of results) {
      // A screen of 1 device pixel per CSS pixel caps every tier at the screen's own size.
      expect(line).toMatch(/ at 360×740: \d+\.\d fps \(median [\d.]+ ms, p95 [\d.]+ ms, worst [\d.]+ ms, N=\d+ frames/);
    }
    expect(lines.slice(4 + steps.length)).toEqual([
      expect.stringMatching(
        new RegExp(
          `^Rapier, ms to load \\+ start, by page load: [\\d.]+ \\+ [\\d.]+(, [\\d.]+ \\+ [\\d.]+){${steps.length - 1}}$`,
        ),
      ),
    ]);

    await expectNothingOffscreen(page);
    await expectTouchTargets(page);
    expect(errors).toEqual([]);
  });
});
