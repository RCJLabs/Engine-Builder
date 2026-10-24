/**
 * M5.6's gate by touch (D68), at 360×740 and 390×844 upright and 844×390 sideways: what
 * foliage.spec.ts does by mouse and keys, done with fingers. The starter kit added; a glade's
 * terrain with Rock painted by one finger; Trees and Grass made new in the inspector's sheet
 * upright and its tab sideways; trees planted and cleared by one finger and the clearing undone;
 * grass filled from the Grass layer; pinched out past the grass's 60 m; every screen in reach;
 * and all of it after a reload.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import {
  addKit,
  fillGrass,
  foliage,
  keptState,
  levelPines,
  nearAndFar,
  newFoliage,
  paintRock,
  plantAndClear,
  TREES,
} from './foliageHelpers.ts';
import { createProject } from './kitHelpers.ts';
import { showProject } from './ludus.ts';
import { pinch } from './modelHelpers.ts';
import { newSpaceFile, showScene, viewStarted } from './spaceHelpers.ts';
import { addTerrain } from './terrainHelpers.ts';

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
  test.describe(`foliage by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('foliage made, planted, cleared, filled, seen far, and kept', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await createProject(page, 'Grove works');
      await addKit(page, true);
      await showScene(page);
      await newSpaceFile(page, 'space', 'Glade');
      await addTerrain(page, 129, true);
      await paintRock(page, true);

      // The terrain's form in the inspector's sheet upright, its tab sideways.
      await newFoliage(page, true);
      await expectInReach(page);

      // A pinch out to about four times as far, where the whole row is in sight.
      await plantAndClear(page, true, () => pinch(page, false));
      await expectInReach(page);
      await fillGrass(page, true);
      await expectInReach(page);
      await levelPines(page, true);
      await expectInReach(page);

      await nearAndFar(page, () => pinch(page, false));

      const kept = await keptState(page);
      expect(kept.plants.find((f) => f.foliage === TREES)?.plants).toBeGreaterThan(10);
      await page.reload();
      await showProject(page);
      const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
      await rows.first().getByRole('button', { name: 'Open' }).tap();
      const panel = await showScene(page);
      await panel.getByRole('button', { name: 'Glade (glade) 0 objects' }).tap();
      await viewStarted(page);
      await expect.poll(async () => Object.keys(await foliage(page)).length).toBe(2);
      await expect.poll(() => keptState(page)).toEqual(kept);
      await expectInReach(page);
      expect(errors).toEqual([]);
    });
  });
}
