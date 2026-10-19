/**
 * M3.6 on phones, portrait and landscape: the roster kit ticked by touch, Stats with it, and a
 * recruit template's names, rolled stat and trait filled in in the inspector's sheet, all in reach.
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

async function newRecord(page: Page, type: string, name: string): Promise<void> {
  await page.getByRole('tab', { name: 'Records' }).tap();
  await page.getByLabel('Type', { exact: true }).selectOption(type);
  await page.getByRole('button', { name: `New ${type}`, exact: true }).tap();
  await page.getByLabel(`Name of the new ${type}`).fill(name);
  await page.getByRole('button', { name: 'Create' }).tap();
  await expect(
    page.getByRole('region', { name: `${type.charAt(0).toUpperCase()}${type.slice(1)} ${name.toLowerCase()}` }),
  ).toBeVisible();
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 740, height: 360 },
]) {
  test.describe(`roster, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('the roster ticked by touch, and a recruit’s names, rolled stat and trait, all in reach', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      await showProject(page);
      await page.getByRole('button', { name: 'New project' }).tap();
      await page.getByLabel('Name').fill('Crew');
      await page.getByRole('button', { name: 'Create' }).tap();
      await expect(openProject(page).getByRole('heading', { name: 'Crew' })).toBeVisible();
      const kits = openProject(page).getByRole('group', { name: 'Kits' });
      await kits.getByLabel('Roster', { exact: true }).tap();
      await expect(kits.getByLabel('Stats', { exact: true })).toBeChecked();
      await expectFits(page, '[data-panel="project"]');

      await newRecord(page, 'stat', 'Aim');
      await newRecord(page, 'status', 'Steady');
      await newRecord(page, 'recruit', 'Deckhand');
      const form = page.getByRole('region', { name: 'Recruit deckhand' });
      const names = form.getByRole('group', { name: 'Names', exact: true });
      await names.getByRole('button', { name: 'Add to Names' }).tap();
      await names.getByLabel('Names, item 1', { exact: true }).fill('Ketil');
      await form.getByRole('button', { name: 'Add to Rolled stats' }).tap();
      await page.getByRole('dialog', { name: 'Add to Rolled stats' }).getByRole('option', { name: 'Aim (aim)' }).tap();
      const aim = form.getByRole('group', { name: 'Rolled stats: aim' });
      await aim.getByLabel(/^From/).fill('2');
      await aim.getByLabel(/^To/).fill('5');
      await form.getByRole('button', { name: 'Add to Traits' }).tap();
      const trait = form.getByRole('group', { name: 'Traits, item 1' });
      await trait.getByRole('button', { name: /^Status/ }).tap();
      await page
        .getByRole('dialog', { name: 'Choose a status' })
        .getByRole('option', { name: 'Steady (steady)' })
        .tap();
      await trait.getByRole('textbox', { name: /^Chance/ }).fill('25');
      await expect
        .poll(() => stored(page, 'crew', 'records/recruit/deckhand.json'))
        .toMatchObject({
          names: ['Ketil'],
          stats: { aim: { min: 2, max: 5 } },
          traits: [{ status: 'steady', chance: 25 }],
        });
      await expectFits(page, '[data-panel="inspector"]');
      expect(errors).toEqual([]);
    });
  });
}
