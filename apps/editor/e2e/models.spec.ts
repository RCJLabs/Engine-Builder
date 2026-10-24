/**
 * M5.5's gate by mouse and keys (D67): in a new project, a Draco GLB, a Meshopt GLB and one whose
 * texture is a KTX2 imported in one pick, each packed with a model record; a material from the
 * Wood preset on the crate's slot, a LOD level made and a sphere fitted to it; all three placed
 * in a space and read back through window.__ebViewport: the hills whole near and a tenth far, the
 * crate's sphere and its slot's colour, the sign's texture drawn; the starter kit added and its
 * pine placed; and all of it the same after a reload.
 */
import { expect, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { choose } from './componentHelpers.ts';
import { createProject } from './kitHelpers.ts';
import { showProject } from './ludus.ts';
import {
  addKit,
  expectDrawn,
  importModels,
  makeBark,
  models,
  nearAndFar,
  placeModel,
  shapeCrate,
} from './modelHelpers.ts';
import { newSpaceFile, showScene, viewStarted } from './spaceHelpers.ts';

test.use({ viewport: { width: 1280, height: 800 } });

test('models imported, shaped, placed and read back, the starter kit added, and kept', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await createProject(page, 'Model works');
  await importModels(page, false);
  await makeBark(page);
  const crate = await shapeCrate(page, false);
  await expect(crate.getByRole('group', { name: 'Fit collider' })).toBeVisible();
  await expectNoAxeIssues(page);

  await showScene(page);
  await newSpaceFile(page, 'space', 'Yard');
  for (const name of [/^hills/, /^crate/, /^sign/]) await placeModel(page, name, false);
  await expectDrawn(page);
  await choose(page, 'hills', false);
  const { near, far } = await nearAndFar(page, false);
  expect(near).toBe(2048);
  // A tenth of 2,048 is 204: the simplifier keeps within a fifth of it, or the sloppy one does.
  expect(far).toBeGreaterThan(0);
  expect(far).toBeLessThanOrEqual(246);

  await addKit(page, false);
  await showScene(page);
  await placeModel(page, /^Pine/, false);
  await expect
    .poll(async () => (await models(page))['kit-pine']?.materials)
    .toEqual({
      wood: '#8a5a35',
      leaves: '#4f7f3a',
    });
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="scene"], [data-panel="assets"], [data-panel="inspector"]')).toEqual([]);
  await expectNoAxeIssues(page);
  const kept = await models(page);

  await page.reload();
  await showProject(page);
  const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
  await rows.first().getByRole('button', { name: 'Open' }).click();
  const panel = await showScene(page);
  await panel.getByRole('button', { name: /^Yard/ }).click();
  await viewStarted(page);
  await expectDrawn(page);
  await expect.poll(async () => Object.keys(await models(page)).sort()).toEqual(Object.keys(kept).sort());
  const again = await models(page);
  for (const id of Object.keys(kept)) {
    expect(again[id], id).toMatchObject({ collider: kept[id]?.collider, materials: kept[id]?.materials });
  }
  expect(errors).toEqual([]);
});
