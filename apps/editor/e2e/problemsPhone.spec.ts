/**
 * M2.8 on phones, portrait and landscape: the Problems tab with its count, every control in reach,
 * a problem opening its record at the field; and a step refused on a phone said where it is seen,
 * in a toast that leads to the console.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { importLudus, LUDUS, PNG, SPICULUS, showAssets } from './ludus.ts';

const spiculus = JSON.parse(readFileSync(join(LUDUS, SPICULUS), 'utf8'));

async function expectFits(page: Page, scope: string): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, scope)).toEqual([]);
  await expectNoAxeIssues(page);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 740, height: 360 },
]) {
  test.describe(`problems, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('the tab counts them, the list is in reach, and a problem opens its field', async ({ page }) => {
      const errors = watchErrors(page);
      await importLudus(page, {
        'records/gladiator/bad.json': JSON.stringify({ ...spiculus, name: 'Bad', might: 'strong' }),
        'records/gladiator/notes.md': 'Gladiators fight at noon.',
      });
      const tab = page.getByRole('tab', { name: /^Problems/ });
      const badge = tab.locator('.tab-badge');
      await expect(badge).toHaveText('2');
      await expect(badge).toHaveClass(/\berror\b/);
      await tab.tap();
      const panel = page.locator('[data-panel="problems"]');
      const items = panel.locator('.problem-items > li');
      await expect(items).toHaveCount(2);
      await expectFits(page, '[data-panel="problems"]');

      // The panel goes when another tab of its zone is shown; its search stays.
      await panel.getByLabel('Search problems').fill('might');
      await expect(items).toHaveCount(1);
      await page.getByRole('tab', { name: 'Project' }).tap();
      await tab.tap();
      await expect(panel.getByLabel('Search problems')).toHaveValue('might');
      await expect(items).toHaveCount(1);

      await panel.getByRole('button', { name: /E001 .* · Might$/ }).tap();
      // In the sheet on a phone held upright; beside the panel in landscape, which is tablet width.
      const might = page.getByRole('region', { name: 'Gladiator bad' }).getByLabel('Might', { exact: true });
      await expect(might).toBeFocused();
      await might.fill('50');
      // A warning is all that's left: the badge says so, not in red.
      await expect(badge).toHaveText('1');
      await expect(badge).not.toHaveClass(/\berror\b/);
      expect(errors).toEqual([]);
    });

    test('a refused step shows as a toast in reach, and its line stays in the console', async ({ page }) => {
      const errors = watchErrors(page);
      await importLudus(page, { 'assets/assets.json': '{ "files": ' });
      const panel = await showAssets(page);
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        panel.getByRole('button', { name: 'Import files' }).tap(),
      ]);
      await chooser.setFiles([{ name: 'flamma.png', mimeType: 'image/png', buffer: PNG }]);
      const form = panel.getByRole('region', { name: /^Import / });
      await form.getByLabel('Licence').selectOption('own');
      await form.getByLabel('Where it came from').fill('Drawn for the ludus');
      await form.getByLabel('Date').fill('2026-10-18');
      const go = form.getByRole('button', { name: 'Import 1 file' });
      await go.tap();

      const toast = page.getByRole('alert');
      await expect(toast).toContainText(
        'Couldn’t import images/flamma.png: assets/assets.json isn’t JSON: fix it first.',
      );
      await expectFits(page, '.error-toast');
      // Dismiss closes it where it is; a second refusal brings it back, and Console goes there.
      await toast.getByRole('button', { name: 'Dismiss' }).tap();
      await expect(toast).toBeHidden();
      await expect(form).toBeVisible();
      await go.tap();
      await expect(toast).toBeVisible();
      await toast.getByRole('button', { name: 'Console' }).tap();
      await expect(toast).toBeHidden();
      // A tab of its own held upright; in landscape, tablet width, the strip along the bottom.
      const lines = page.getByRole('list', { name: 'Console messages' });
      if (viewport.width < viewport.height) {
        await expect(page.getByRole('tab', { name: 'Console' })).toHaveAttribute('aria-selected', 'true');
      } else {
        await expect(lines).toBeFocused();
      }
      await expect(lines.locator('.console-error')).toContainText('Error: Couldn’t import images/flamma.png');
      await expect(lines.locator('.console-error')).toContainText('×2');
      await expectFits(page, '.console');
      expect(errors).toEqual([]);
    });
  });
}

test.describe('the error toast, phone 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('goes by itself after 8 s, the console keeping its line', async ({ page }) => {
    const errors = watchErrors(page);
    await importLudus(page, { 'assets/assets.json': '{ "files": ' });
    const panel = await showAssets(page);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      panel.getByRole('button', { name: 'Import files' }).tap(),
    ]);
    await chooser.setFiles([{ name: 'flamma.png', mimeType: 'image/png', buffer: PNG }]);
    const form = panel.getByRole('region', { name: /^Import / });
    await form.getByLabel('Licence').selectOption('own');
    await form.getByLabel('Where it came from').fill('Drawn for the ludus');
    await form.getByLabel('Date').fill('2026-10-18');
    // The page's clock from here on, so the toast's 8 s pass at once.
    await page.clock.install();
    await form.getByRole('button', { name: 'Import 1 file' }).tap();
    const toast = page.getByRole('alert');
    await expect(toast).toBeVisible();
    await page.clock.runFor(7_900);
    await expect(toast).toBeVisible();
    await page.clock.runFor(200);
    await expect(toast).toBeHidden();
    await page.getByRole('tab', { name: 'Console' }).tap();
    await expect(page.locator('[data-panel="console"] .console-error')).toContainText('Couldn’t import');
    expect(errors).toEqual([]);
  });
});

test.describe('a zone of more tabs than fit, tablet width 740×360', () => {
  test.use({ viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true });

  test('keeps the tab of a panel shown from elsewhere in view', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    const strip = page.getByRole('tablist', { name: 'side panels' });
    const logic = strip.getByRole('tab', { name: 'Logic' });
    await page.getByRole('button', { name: 'Commands' }).tap();
    await page.getByRole('option', { name: 'Show the Logic panel' }).tap();
    await expect(logic).toHaveAttribute('aria-selected', 'true');
    // Focus goes into the panel, not the tab, so only the zone can bring its tab into view.
    await expect
      .poll(async () => {
        const [tab, list] = await Promise.all([logic.boundingBox(), strip.boundingBox()]);
        return tab && list ? tab.x >= list.x - 0.5 && tab.x + tab.width <= list.x + list.width + 0.5 : false;
      })
      .toBe(true);
    expect(errors).toEqual([]);
  });
});
