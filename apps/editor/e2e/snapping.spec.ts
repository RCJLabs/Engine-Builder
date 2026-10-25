/**
 * M5.10's snapping gate on desktop (D72, docs/specs/streaming.md#snapping): a hut built from the
 * starter kit by mouse in a new project. A floor; a wall and a doorway dragged to its edges until
 * they latch flush, read back from the file to the millimetre; a roof latched over it and onto the
 * walls' tops; the grid's step at 1 m, a move landing on whole metres; Drop putting the roof back on
 * the walls; an undo and a redo; and a reload, the file and the step as they were.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { createProject } from './kitHelpers.ts';
import { addKitTo, at, buildHut, dragUntil, expectAt, hut } from './snappingHelpers.ts';
import { newSpaceFile, scenePanel, showScene, viewStarted } from './spaceHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 } });

test('a hut snapped together from the starter kit by mouse, dropped, undone and kept', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await createProject(page, 'Hut works');
  await addKitTo(page, false);
  await showScene(page);
  await newSpaceFile(page, 'space', 'Hut');
  const ids = await buildHut(page, false, (title, body) => test.step(title, body));
  const panel = scenePanel(page);

  await test.step('the grid at 1 m: a move away from everything lands on whole metres, and latches nothing', async () => {
    await panel.getByLabel('Grid').selectOption('1');
    // Up until the roof is first drawn at 3.5 m or more, clear of the walls' tops: from 2.5, a 1 m
    // step puts it at 4 where the 0.5 m one would stop at 3.5.
    const latched = await dragUntil(page, 'move-y', ids.roof, 1, (now) => (now.box?.min[1] ?? 0) >= 3.5, false);
    expect(latched).toEqual([]);
    await expectAt(page, ids.roof, [0, 4, 0]);
  });

  await test.step('Drop puts the roof back on the walls; an undo lifts it, a redo drops it again', async () => {
    await panel.getByRole('button', { name: 'Drop' }).click();
    await expectAt(page, ids.roof, [0, 2.5, 0]);
    await page.getByRole('button', { name: 'Undo: Drop 1 object' }).click();
    await expectAt(page, ids.roof, [0, 4, 0]);
    await page.getByRole('button', { name: 'Redo: Drop 1 object' }).click();
    await expectAt(page, ids.roof, [0, 2.5, 0]);
  });

  await test.step('reloaded: the hut and the grid’s step as they were', async () => {
    const before = await hut(page);
    await expect(page.getByText('All changes saved.')).toBeVisible();
    await page.reload();
    const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
    await rows.first().getByRole('button', { name: 'Open' }).click();
    await showScene(page);
    await panel.getByRole('button', { name: 'Hut (hut) 4 objects' }).click();
    await viewStarted(page);
    expect(await hut(page)).toEqual(before);
    await expect(panel.getByLabel('Grid')).toHaveValue('1');
    expect(await at(page, ids.wall)).toEqual([0, 0, 0.9]);
    expect(await at(page, ids.door)).toEqual([0, 0, -0.9]);
  });

  expect(errors).toEqual([]);
});
