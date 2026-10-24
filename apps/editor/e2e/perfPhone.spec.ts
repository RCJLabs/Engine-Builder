/**
 * M5.7's gate by touch (D69), at 360×740 and 390×844 upright and 844×390 sideways, on a screen of
 * three device pixels a point: what perf.spec.ts does, with fingers. The glade opened and Stats
 * tapped; Auto at Low; Medium and High picked, each read back from three, the pixel ratio held to
 * each tier's most; every screen in reach; and after a reload, the tier and Stats as they were.
 * The count budgets are desktop's: a phone's view is framed to its own shape, so it draws other
 * levels of the same plants.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { showProject } from './ludus.ts';
import { chooseQuality, expectTier, openGlade, overlay, pressStats, qualityRow, reopenGlade } from './perfHelpers.ts';

const DPR = 3;

async function expectInReach(page: Page): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="scene"]')).toEqual([]);
  await expectNoAxeIssues(page);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`quality by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({
      viewport,
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: DPR,
      actionTimeout: 20_000,
      storageState: { cookies: [], origins: [] },
    });

    test('the glade at each tier, Auto by the device, and kept', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = watchErrors(page);
      await openGlade(page, true);
      await pressStats(page, true);
      await expect(overlay(page)).toContainText('Auto: Low (a software renderer)');
      await expectTier(page, 'low', DPR);
      await expectInReach(page);

      await chooseQuality(page, 'Medium', true);
      await expectTier(page, 'medium', DPR);
      await expect(overlay(page)).toContainText('pixel ratio 1.5');
      await chooseQuality(page, 'High', true);
      await expectTier(page, 'high', DPR);
      await expect(overlay(page)).toContainText('Chosen: High');
      await expect(overlay(page)).toContainText('pixel ratio 2');
      await expectInReach(page);

      await page.reload();
      await showProject(page);
      const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
      await rows.first().getByRole('button', { name: 'Open' }).tap();
      await reopenGlade(page, true);
      const row = await qualityRow(page, true);
      await expect(row.getByLabel('Quality')).toHaveValue('high');
      await expect(row.getByRole('button', { name: 'Stats' })).toHaveAttribute('aria-pressed', 'true');
      await expectTier(page, 'high', DPR);
      expect(errors).toEqual([]);
    });
  });
}
