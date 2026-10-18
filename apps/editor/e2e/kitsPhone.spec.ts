/**
 * M3.3 on phones, portrait and landscape: the Project tab's kits ticked by touch, a kit's record
 * filled in in the inspector's sheet, and a kit's type with its fields locked, all in reach.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
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
  test.describe(`kits, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('kits ticked by touch, a kit’s record and its type in the inspector, all in reach', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      await showProject(page);
      await page.getByRole('button', { name: 'New project' }).tap();
      await page.getByLabel('Name').fill('Stall');
      await page.getByRole('button', { name: 'Create' }).tap();
      await expect(openProject(page).getByRole('heading', { name: 'Stall' })).toBeVisible();
      const kits = openProject(page).getByRole('group', { name: 'Kits' });
      await kits.getByLabel('Economy', { exact: true }).tap();
      await expect(kits.getByLabel('Inventory', { exact: true })).toBeChecked();
      await expectFits(page, '[data-panel="project"]');

      await page.getByRole('tab', { name: 'Records' }).tap();
      await page.getByLabel('Type', { exact: true }).selectOption('item');
      await page.getByRole('button', { name: 'New item', exact: true }).tap();
      await page.getByLabel('Name of the new item').fill('Rope');
      await page.getByRole('button', { name: 'Create' }).tap();
      const form = page.getByRole('region', { name: 'Item rope' });
      await expect(form).toBeVisible();
      await form.getByLabel(/^Value/).fill('12');
      await expectFits(page, '[data-panel="inspector"]');

      // The type's view: the kit's fields shown, and the way to add the project's own.
      const lower = page.getByRole('button', { name: 'Inspector' });
      if (await lower.isVisible()) await lower.tap();
      else await page.getByRole('tab', { name: 'Records' }).tap();
      await page.getByRole('button', { name: 'Edit type' }).tap();
      const design = page.getByRole('region', { name: 'Type Item' });
      await expect(design.getByRole('region', { name: 'The inventory kit’s fields' })).toBeVisible();
      await expect(design.getByRole('button', { name: 'Add fields of your own' })).toBeVisible();
      await expectFits(page, '[data-panel="inspector"]');
      expect(errors).toEqual([]);
    });
  });
}
