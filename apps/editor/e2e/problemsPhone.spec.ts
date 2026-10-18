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
      await expect(tab.locator('.tab-badge')).toHaveText('2');
      await tab.tap();
      const panel = page.locator('[data-panel="problems"]');
      await expect(panel.locator('.problem-items > li')).toHaveCount(2);
      await expectFits(page, '[data-panel="problems"]');

      await panel.getByRole('button', { name: /E001 .* · Might$/ }).tap();
      // In the sheet on a phone held upright; beside the panel in landscape, which is tablet width.
      const might = page.getByRole('region', { name: 'Gladiator bad' }).getByLabel('Might', { exact: true });
      await expect(might).toBeFocused();
      await might.fill('50');
      await expect(tab.locator('.tab-badge')).toHaveText('1');
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
      await form.getByRole('button', { name: 'Import 1 file' }).tap();

      const toast = page.getByRole('alert');
      await expect(toast).toContainText(
        'Couldn’t import images/flamma.png: assets/assets.json isn’t JSON: fix it first.',
      );
      await expectFits(page, '.error-toast');
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
      await expectFits(page, '.console');
      expect(errors).toEqual([]);
    });
  });
}
