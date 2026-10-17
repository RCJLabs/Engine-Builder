/** M2.5's Records panel on phones, portrait and landscape: a table that scrolls on its own, by touch. */
import { expect, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { importLudus, recordLink, SPICULUS, showTable, stored } from './ludus.ts';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 740, height: 360 },
]) {
  test.describe(`records, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('scrolls the table on its own, sorts and selects by touch, and opens a record', async ({ page }) => {
      const errors = watchErrors(page);
      await importLudus(page);
      const table = await showTable(page, 'Gladiator');
      // The table is wider than the screen; its region scrolls, the page doesn't.
      const scroll = await table.evaluate((el) => ({ wide: el.scrollWidth, shown: el.clientWidth }));
      expect(scroll.wide).toBeGreaterThan(scroll.shown);
      await expectNothingOffscreen(page);
      expect(await smallTargets(page, '[data-panel="records"]')).toEqual([]);
      await expectNoAxeIssues(page);

      await table.getByRole('button', { name: 'Might' }).tap();
      await expect(table.getByRole('columnheader', { name: 'Might' })).toHaveAttribute('aria-sort', 'ascending');
      // The record column stays at the left edge as the rest scrolls under it.
      const before = await recordLink(table, 'priscus').boundingBox();
      await table.evaluate((el) => {
        el.scrollLeft = 400;
      });
      const after = await recordLink(table, 'priscus').boundingBox();
      expect(after?.x).toBe(before?.x);

      await table.getByRole('checkbox', { name: 'Select spiculus' }).tap();
      await page.getByRole('button', { name: 'Edit a field' }).tap();
      const bulk = page.getByRole('region', { name: 'Edit a field on 1 record' });
      await bulk.getByLabel('Field', { exact: true }).selectOption({ label: 'Style' });
      await bulk.getByLabel('Style', { exact: true }).selectOption('thraex');
      await expectNothingOffscreen(page);
      expect(await smallTargets(page, '[data-panel="records"]')).toEqual([]);
      await expectNoAxeIssues(page);
      await bulk.getByRole('button', { name: 'Set on 1 record' }).tap();
      await expect.poll(() => stored(page, SPICULUS)).toMatchObject({ style: 'thraex' });

      await recordLink(table, 'spiculus').tap();
      await expect(page.getByRole('region', { name: 'Gladiator spiculus' })).toBeVisible();
      await expectNothingOffscreen(page);
      expect(errors).toEqual([]);
    });
  });
}
