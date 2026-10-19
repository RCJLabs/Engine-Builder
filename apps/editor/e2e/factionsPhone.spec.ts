/**
 * M3.5 on phones, portrait and landscape: the factions and time kits ticked by touch, a season
 * added to the calendar in the Project panel, and a faction's bands filled in in the inspector's
 * sheet, all in reach.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { stored } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';

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
  test.describe(`factions, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('factions and time ticked by touch, a season and a faction’s bands, all in reach', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      await showProject(page);
      await page.getByRole('button', { name: 'New project' }).tap();
      await page.getByLabel('Name').fill('Steading');
      await page.getByRole('button', { name: 'Create' }).tap();
      await expect(openProject(page).getByRole('heading', { name: 'Steading' })).toBeVisible();
      const kits = openProject(page).getByRole('group', { name: 'Kits' });
      await kits.getByLabel('Factions', { exact: true }).tap();
      await kits.getByLabel('Time', { exact: true }).tap();
      const calendar = openProject(page).getByRole('group', { name: 'Calendar' });
      await calendar.getByLabel(/^Days a year/).fill('96');
      await calendar.getByRole('button', { name: 'Add to Seasons' }).tap();
      await calendar.getByRole('group', { name: 'Seasons, item 1' }).getByLabel(/^Name/).fill('summer');
      await expect
        .poll(() => stored(page, 'steading', 'project.json'))
        .toMatchObject({ calendar: { daysPerYear: 96, seasons: [{ id: 'summer', from: 0 }] } });
      await expectFits(page, '[data-panel="project"]');

      await page.getByRole('tab', { name: 'Records' }).tap();
      await page.getByLabel('Type', { exact: true }).selectOption('faction');
      await page.getByRole('button', { name: 'New faction', exact: true }).tap();
      await page.getByLabel('Name of the new faction').fill('Guild');
      await page.getByRole('button', { name: 'Create' }).tap();
      const form = page.getByRole('region', { name: 'Faction guild' });
      await expect(form).toBeVisible();
      await form.getByRole('button', { name: 'Add to Bands' }).tap();
      await form.getByRole('group', { name: 'Bands, item 1' }).getByLabel(/^Id/).fill('wary');
      await form.getByRole('button', { name: 'Add Drift' }).tap();
      await expect
        .poll(() => stored(page, 'steading', 'records/faction/guild.json'))
        .toEqual({ name: 'Guild', bands: [{ id: 'wary' }], drift: { every: 1 } });
      await expectFits(page, '[data-panel="inspector"]');
      expect(errors).toEqual([]);
    });
  });
}
