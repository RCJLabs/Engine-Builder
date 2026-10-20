/** Checks every page gets: no console errors, nothing past the device's width, no axe issues. */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Console errors and uncaught exceptions seen while a test runs; every test expects none. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/**
 * Every rendered box sits inside the device's width. Two things make the obvious checks unable
 * to fail, both seen while proving this one:
 * - the shell never scrolls the page (body is overflow: hidden), so `scrollWidth` reports the
 *   viewport whatever the content does;
 * - on a phone, content that is too wide makes the browser widen the layout viewport and zoom
 *   out, so `innerWidth` grows with the content.
 * So the width comes from the test's own viewport, and the layout viewport must not have grown.
 * An intentional horizontal scroller can opt out with `data-scroll-x`. A box of 1×1 px or less is
 * the visually-hidden pattern for screen readers (dockview's live regions sit at -1 px), not content.
 */
export async function expectNothingOffscreen(page: Page): Promise<void> {
  const width = page.viewportSize()?.width ?? 0;
  expect(await page.evaluate(() => window.innerWidth), 'layout viewport grew past the device width').toBe(width);
  const offenders = await page.evaluate((width) => {
    const found: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[data-scroll-x]')) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || (box.width <= 1 && box.height <= 1)) continue;
      if (box.right > width + 0.5 || box.left < -0.5) {
        found.push(
          `${el.tagName.toLowerCase()}.${el.getAttribute('class')} [${Math.round(box.left)}–${Math.round(box.right)}]`,
        );
      }
    }
    return found.slice(0, 5);
  }, width);
  expect(offenders, 'elements outside the viewport').toEqual([]);
  // The editor's shell is the screen's height, its panels scrolling inside it. A page that scrolls
  // as a whole takes the top bar off a phone's screen, as a long form's hidden labels once did (M3.1).
  const overflow = await page.evaluate(() =>
    document.querySelector('.shell') ? document.documentElement.scrollHeight - window.innerHeight : 0,
  );
  expect(overflow, 'the page scrolls as a whole, past the shell').toBeLessThanOrEqual(0);
}

/**
 * Visible controls inside `scope` (a CSS selector) narrower or shorter than 44 px, as "name w×h",
 * and anything marked `data-target`, such as the outline's drag handles (M4.5). The designer's
 * frame is a picture of a game, inert and scaled down: none of it is a target.
 */
export function smallTargets(page: Page, scope: string): Promise<string[]> {
  const controls = 'button, input, select, textarea, a[href], [role="tab"], [role="option"], [data-target]';
  return page.locator(`${scope} :is(${controls}):not(.eb-designed *):visible`).evaluateAll((els) =>
    els
      .map((el) => ({
        name: el.textContent?.trim() || el.getAttribute('aria-label') || el.id,
        box: el.getBoundingClientRect(),
      }))
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .map(({ name, box }) => `${name} ${Math.round(box.width)}×${Math.round(box.height)}`),
  );
}

/**
 * No axe violations of any impact. It once let moderate ones through, and a dock that repeated
 * each group's landmark passed (M2.2), so every impact counts. Also no id on two elements: axe
 * no longer looks, and a label pointing at a shared id names the first element that has it (M2.5:
 * the dock's panels, each its own render root, made the same ids). It waits for what is fading
 * in to land: a toast caught mid-fade by axe read as low contrast, in one run of the full suite (M4.5).
 */
export async function expectNoAxeIssues(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Number.POSITIVE_INFINITY)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes[0]?.target.join(' ')})`)).toEqual([]);
  const twice = await page.evaluate(() => {
    const seen = new Set<string>();
    const found = new Set<string>();
    for (const el of document.querySelectorAll('[id]')) {
      if (seen.has(el.id)) found.add(el.id);
      seen.add(el.id);
    }
    return [...found];
  });
  expect(twice, 'ids on more than one element').toEqual([]);
}

/**
 * Waits for the service worker's first install. The editor says "Offline copy saved" as it ends,
 * once the precache is in (1.8 MB since M3.2), and the line once landed between two refused
 * imports a test expected in a row (M3.3's check). A test whose console lines must follow each
 * other waits for it first.
 */
export async function offlineSaved(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}
