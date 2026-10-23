/**
 * M4.7's gate on phones (D57), upright at 360 and 390 px and held sideways: the drift flown by
 * touch from the Play panel's seed to its first hostile ship, the odds on its buttons the table's,
 * the event in reach with nothing past the edges, no target under 44 px and nothing axe finds; the
 * fight fought by a tap and the drift flown on to its exit; and the raiders' table above their form
 * in the inspector sheet, its party picked by touch, in reach.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { expectHailedOdds, flyToHostile, hailing } from './encounterHelpers.ts';
import { expectFits, press, topScreen } from './hutScreens.ts';
import { recordLink, recordsTable } from './ludus.ts';
import { DRIFT, flyHome, importFolder, startDrift } from './mapHelpers.ts';

async function expectInReach(page: Page): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="inspector"]')).toEqual([]);
  await expectNoAxeIssues(page);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the drift's fights, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('a hostile ship fought by touch, its odds the table’s, and the drift flown on to its exit', async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      await importFolder(page, DRIFT, 'the-drift', 'The drift');
      await startDrift(page, true);
      await flyToHostile(page, true);
      await expectHailedOdds(page);
      await expectFits(page);
      await press(page, hailing(page).getByRole('listitem').getByRole('button').first(), true);
      await expect(hailing(page).getByRole('heading', { name: 'Hostile ship' })).toHaveCount(0);
      await flyHome(page, true);
      await expect(topScreen(page).getByText('The game is over.')).toBeVisible();
      await expectFits(page);
      expect(errors).toEqual([]);
    });

    test('the raiders’ table in the inspector sheet, its party picked by touch', async ({ page }) => {
      test.setTimeout(120_000);
      const errors = watchErrors(page);
      await importFolder(page, DRIFT, 'the-drift', 'The drift');
      await page.getByRole('tab', { name: 'Records' }).tap();
      await page.getByLabel('Type', { exact: true }).selectOption('encounter');
      await recordLink(recordsTable(page, 'Encounter'), 'raiders').tap();
      const form = page.getByRole('region', { name: 'Encounter raiders' });
      const table = form.getByRole('region', { name: 'How the fight goes' });
      await expect(table.locator('.fight-head')).toHaveText(['Win 67%', 'Draw 16%', 'Lose 17%']);
      await expectInReach(page);
      await table.getByLabel('Who fights').selectOption({ label: 'Raider alone' });
      await expect(table.getByText('Raider, at full health, as the game works it out.')).toBeVisible();
      await expectInReach(page);
      expect(errors).toEqual([]);
    });
  });
}
