/**
 * M5.6's gate on desktop (D68), by mouse and keys: from an empty project, the starter kit added,
 * a glade given a 129-vertex terrain with Rock painted at a spot of its own; Trees and Grass made
 * new in the terrain's form; trees planted in a stroke and cleared across part of it, the clearing
 * undone; grass filled from the Grass layer, bare at the Rock; the trees drawn near, and zoomed out
 * past the grass's 60 m no grass drawn though every plant is scattered; and after a reload all of
 * it as it was.
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
  view,
} from './foliageHelpers.ts';
import { createProject } from './kitHelpers.ts';
import { newSpaceFile, showScene, viewStarted } from './spaceHelpers.ts';
import { addTerrain } from './terrainHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const inReach = async (page: Page) => {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="scene"], [data-panel="outliner"], [data-panel="inspector"]')).toEqual(
    [],
  );
  await expectNoAxeIssues(page);
};

/** The camera a fifth further off, by the view's own key. */
const zoomOut = async (page: Page) => {
  await view(page).focus();
  await page.keyboard.press('Minus');
};

test('foliage made, planted, cleared, filled, seen near and far, and kept', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await createProject(page, 'Grove works');
  await addKit(page, false);
  await showScene(page);
  await newSpaceFile(page, 'space', 'Glade');
  await addTerrain(page, 129, false);
  await paintRock(page, false);

  await newFoliage(page, false);
  await inReach(page);

  // Out to about 50 m, where the whole row is in sight.
  await plantAndClear(page, false, async () => {
    for (let i = 0; i < 6; i++) await zoomOut(page);
  });
  await inReach(page);
  await fillGrass(page, false);
  await inReach(page);
  await levelPines(page, false);
  await inReach(page);

  // From about 50 m, out past the grass's reach.
  await nearAndFar(page, () => zoomOut(page));

  const kept = await keptState(page);
  expect(kept.plants.find((f) => f.foliage === TREES)?.plants).toBeGreaterThan(10);
  await expect(page.getByText('All changes saved.')).toBeVisible();
  await page.reload();
  const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
  await rows.first().getByRole('button', { name: 'Open' }).click();
  const panel = await showScene(page);
  await panel.getByRole('button', { name: 'Glade (glade) 0 objects' }).click();
  await viewStarted(page);
  await expect.poll(async () => Object.keys(await foliage(page)).length).toBe(2);
  await expect.poll(() => keptState(page)).toEqual(kept);
  await inReach(page);
  expect(errors).toEqual([]);
});
