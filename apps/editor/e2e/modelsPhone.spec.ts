/**
 * M5.5's gate by touch (D67), at 360×740 and 390×844 upright and 844×390 sideways: what
 * models.spec.ts does by mouse and keys, done with fingers. Three models imported in one pick, a
 * material from a preset on the crate's slot, a LOD level and a sphere made for it in the
 * inspector's sheet upright and its tab sideways; all three placed and read back through the
 * view's hook, the hills whole near and a tenth far by pinching; the starter kit added and its
 * pine placed; every screen in reach; and all of it after a reload.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { choose } from './componentHelpers.ts';
import { createProject } from './kitHelpers.ts';
import { showProject } from './ludus.ts';
import {
  addKit,
  expectDrawn,
  expectStored,
  expectWireOn,
  importModels,
  makeBark,
  models,
  nearAndFar,
  placeModel,
  shapeCrate,
} from './modelHelpers.ts';
import { newSpaceFile, showScene, viewStarted } from './spaceHelpers.ts';
import { lowerSheet } from './templateHelpers.ts';

async function expectInReach(page: Page): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="scene"], [data-panel="assets"], [data-panel="inspector"]')).toEqual([]);
  await expectNoAxeIssues(page);
}

/** The Scene panel in sight: the sheet lowered upright, the Scene tab sideways. */
async function seeScene(page: Page): Promise<void> {
  await lowerSheet(page);
  await showScene(page);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`models by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('models imported, shaped, placed and read back, the starter kit added, and kept', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await createProject(page, 'Model works');
      await importModels(page, true);
      await makeBark(page);
      await shapeCrate(page, true);
      await expectInReach(page);

      await seeScene(page);
      await newSpaceFile(page, 'space', 'Yard');
      for (const name of [/^hills/, /^crate/, /^sign/]) await placeModel(page, name, true);
      await expectDrawn(page);
      await choose(page, 'hills', true);
      await expectWireOn(page, 'hills');
      await seeScene(page);
      const { near, far } = await nearAndFar(page, true);
      expect(near).toBe(2048);
      expect(far).toBeGreaterThan(0);
      expect(far).toBeLessThanOrEqual(246);

      await lowerSheet(page);
      await addKit(page, true);
      await expectInReach(page);
      await seeScene(page);
      await placeModel(page, /^Pine/, true);
      await expect
        .poll(async () => (await models(page))['kit-pine']?.materials)
        .toEqual({
          wood: '#8a5a35',
          leaves: '#4f7f3a',
        });
      await expectInReach(page);
      const kept = await models(page);
      await expectStored(page);

      await page.reload();
      await showProject(page);
      const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
      await rows.first().getByRole('button', { name: 'Open' }).tap();
      const panel = await showScene(page);
      await panel.getByRole('button', { name: /^Yard/ }).tap();
      await viewStarted(page);
      await expectDrawn(page);
      // As long as expectDrawn's wait: the last file decoded can come a batch later, slower beside another worker's frames.
      await expect
        .poll(async () => Object.keys(await models(page)).sort(), { timeout: 20_000 })
        .toEqual(Object.keys(kept).sort())
        .catch((error: Error) => {
          // Whatever the page said by then, as the failure: the errors check below comes too late to.
          throw new Error(`${error.message}\nThe page's errors: ${JSON.stringify(errors)}`);
        });
      const again = await models(page);
      for (const id of Object.keys(kept)) {
        expect(again[id], id).toMatchObject({ collider: kept[id]?.collider, materials: kept[id]?.materials });
      }
      expect(errors).toEqual([]);
    });
  });
}
