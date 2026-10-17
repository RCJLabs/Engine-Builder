/** Checks every page gets: no console errors, nothing past the device's width, no serious axe issues. */
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
 * An intentional horizontal scroller can opt out with `data-scroll-x`.
 */
export async function expectNothingOffscreen(page: Page): Promise<void> {
  const width = page.viewportSize()?.width ?? 0;
  expect(await page.evaluate(() => window.innerWidth), 'layout viewport grew past the device width').toBe(width);
  const offenders = await page.evaluate((width) => {
    const found: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[data-scroll-x]')) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.right > width + 0.5 || box.left < -0.5) {
        found.push(
          `${el.tagName.toLowerCase()}.${el.getAttribute('class')} [${Math.round(box.left)}–${Math.round(box.right)}]`,
        );
      }
    }
    return found.slice(0, 5);
  }, width);
  expect(offenders, 'elements outside the viewport').toEqual([]);
}

export async function expectNoSeriousAxeIssues(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
