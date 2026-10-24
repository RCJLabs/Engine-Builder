/**
 * M5.2's gate by touch (D64), at 360×740 and 390×844 upright and 844×390 sideways: the lodge
 * components.spec.ts makes by mouse and keys, made with fingers. The type designer, the Scene
 * panel's list and each object's form in the inspector's sheet upright and a tab sideways; a
 * component added and set, Greta placed and her greeting changed, the lamp's box turned up and
 * recoloured inside its placement and the colour reverted; every screen in reach; and all of it
 * after a reload.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import {
  expectLabelOver,
  expectOverridesShown,
  makeHold,
  makeKeeper,
  makeLamp,
  makeYard,
  overrideGreeting,
  overrideInside,
  yard,
} from './componentHelpers.ts';
import { createProject } from './kitHelpers.ts';
import { showProject } from './ludus.ts';
import { showScene, viewStarted } from './spaceHelpers.ts';
import { lowerSheet } from './templateHelpers.ts';

async function expectInReach(page: Page): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="scene"], [data-panel="outliner"], [data-panel="inspector"]')).toEqual(
    [],
  );
  await expectNoAxeIssues(page);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`components by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('added, set, placed, overridden, reverted and kept', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = watchErrors(page);
      await createProject(page, 'Lodge works');
      await makeKeeper(page, true);
      await expectInReach(page);
      await makeHold(page, true);
      await expectInReach(page);
      await makeLamp(page, true);
      await expectInReach(page);
      await makeYard(page, true);

      await overrideGreeting(page, true);
      await expectInReach(page);
      await lowerSheet(page);
      await expectLabelOver(page, 'greta', 'Greta');
      await overrideInside(page, true);
      await expectInReach(page);

      // Kept through a reload.
      const kept = await yard(page);
      await page.reload();
      await showProject(page);
      const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
      await rows.first().getByRole('button', { name: 'Open' }).tap();
      const panel = await showScene(page);
      await panel.getByRole('button', { name: 'Yard (yard) 2 objects' }).tap();
      await viewStarted(page);
      expect(await yard(page)).toEqual(kept);
      await expectOverridesShown(page, true);
      await expectInReach(page);
      expect(errors).toEqual([]);
    });
  });
}
