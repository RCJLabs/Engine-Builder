/**
 * M5.2's gate on desktop (D64), by mouse and keys: from an empty project, a keeper type and Greta
 * made with forms; a kind of the project's own, Hold, made in the type designer; a lamp prefab, a
 * box with a light and a hold, each added and set with its form; a yard placing the lamp and Greta,
 * her greeting changed there and the lamp's box turned up and recoloured there, the colour then
 * reverted; Greta's label in the view; her record's In spaces opening the yard where she stands;
 * no problems; and, after a reload, all of it as it was.
 */
import { expect, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import {
  choose,
  expectLabelOver,
  expectOverridesShown,
  inspector,
  makeHold,
  makeKeeper,
  makeLamp,
  makeYard,
  overrideGreeting,
  overrideInside,
  yard,
} from './componentHelpers.ts';
import { createProject } from './kitHelpers.ts';
import { showScene, viewStarted } from './spaceHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const inReach = async (page: import('@playwright/test').Page) => {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="scene"], [data-panel="outliner"], [data-panel="inspector"]')).toEqual(
    [],
  );
  await expectNoAxeIssues(page);
};

test('components, a placed record and a prefab’s overrides, made with forms and kept', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await createProject(page, 'Lodge works');
  await makeKeeper(page, false);
  await makeHold(page, false);
  await inReach(page);
  await makeLamp(page, false);
  await inReach(page);
  await makeYard(page, false);

  // Greta's greeting changed where she stands, and her name over her marker in the view.
  await overrideGreeting(page, false);
  await inReach(page);
  await expectLabelOver(page, 'greta', 'Greta');

  // The lamp's box, inside the placement: turned up and recoloured, the colour then reverted.
  await overrideInside(page, false);
  await inReach(page);
  await page.getByRole('button', { name: 'Undo: Revert colour of lamp › box' }).click();
  await expect.poll(async () => (await yard(page))?.objects[0]?.overrides).toMatchObject({ box: { color: '#ff8800' } });
  await page.getByRole('button', { name: 'Redo: Revert colour of lamp › box' }).click();
  await expect
    .poll(async () => (await yard(page))?.objects[0]?.overrides)
    .toEqual({
      box: { components: { light: { intensity: 8 } } },
    });

  // Greta's record lists where she stands, and opens the yard there.
  const greta = await choose(page, 'greta', false);
  await greta.getByRole('button', { name: 'Open record' }).click();
  const record = page.getByRole('region', { name: 'Keeper greta' });
  await expect(record.getByRole('heading', { name: /^In spaces/ })).toBeVisible();
  await record.getByRole('button', { name: 'Space Yard, greta' }).click();
  await expect(inspector(page).getByRole('heading', { name: 'greta', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();

  // After a reload, every file and every override as it was.
  const kept = await yard(page);
  await expect(page.getByText('All changes saved.')).toBeVisible();
  await page.reload();
  const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
  await rows.first().getByRole('button', { name: 'Open' }).click();
  const panel = await showScene(page);
  await panel.getByRole('button', { name: 'Yard (yard) 2 objects' }).click();
  await viewStarted(page);
  expect(await yard(page)).toEqual(kept);
  await expectOverridesShown(page, false);
  await inReach(page);
  expect(errors).toEqual([]);
});
