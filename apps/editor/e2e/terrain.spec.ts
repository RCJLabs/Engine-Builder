/**
 * M5.3's gate on desktop (D65), by mouse and keys: from an empty project, a space made in the
 * Scene panel and given a 129-vertex terrain; sculpted with each brush and painted with each
 * layer, each stroke one step of undo; its range and a layer's colour changed in its form; a plane
 * given water; the camera zoomed out until chunks of different levels meet at the sculpted seams,
 * finer near than far with no crack; and after a reload all of it as it was.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { showInspector } from './componentHelpers.ts';
import { createProject } from './kitHelpers.ts';
import { newSpaceFile, scenePanel, showScene, viewStarted } from './spaceHelpers.ts';
import {
  addTerrain,
  addWater,
  expectDrawn,
  expectLevels,
  fell,
  heightAt,
  keptState,
  paint,
  sculpt,
  terrainTools,
} from './terrainHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const inReach = async (page: Page) => {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="scene"], [data-panel="outliner"], [data-panel="inspector"]')).toEqual(
    [],
  );
  await expectNoAxeIssues(page);
};

test('a terrain sculpted, painted and watered by mouse, and kept', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await createProject(page, 'Fell works');
  await showScene(page);
  await newSpaceFile(page, 'space', 'Fell');
  await addTerrain(page, 129, false);
  await inReach(page);

  await sculpt(page, false);
  // One stroke, one step: undone, Flatten's trench is back; done again, it is filled as it was.
  const filled = (await heightAt(page, 0, 2)) as number;
  await page.getByRole('button', { name: 'Undo: Flatten the terrain' }).click();
  await expect.poll(() => heightAt(page, 0, 2)).toBeLessThan(filled - 0.1);
  await expectDrawn(page);
  await page.getByRole('button', { name: 'Redo: Flatten the terrain' }).click();
  await expect.poll(() => heightAt(page, 0, 2)).toBeCloseTo(filled, 3);

  await paint(page, false);
  await inReach(page);

  // The form: a lower top keeps every height below it in metres. Typed a key at a time, the 0 of 0.9
  // is never written, which would clamp the smoothed ridge to 0 for good; Rock recoloured.
  const ridge = (await heightAt(page, 0, -2)) as number;
  expect(ridge).toBeGreaterThan(0.05);
  expect(ridge).toBeLessThan(0.9);
  await terrainTools(page).getByRole('button', { name: 'Terrain settings' }).click();
  const form = await showInspector(page, false);
  await expect(form.getByRole('heading', { name: 'Terrain' })).toBeVisible();
  const high = form.getByLabel('High, in metres');
  await high.fill('');
  await high.pressSequentially('0.9', { delay: 150 });
  await high.press('Enter');
  await expect.poll(async () => (await fell(page))?.terrain).toMatchObject({ high: 0.9 });
  await expect.poll(() => heightAt(page, 0, -2)).toBeCloseTo(ridge, 2);
  await form.getByLabel('Colour').nth(1).fill('#7a6f66');
  await expect
    .poll(async () => ((await fell(page))?.terrain as { layers: { color: string }[] })?.layers[1]?.color)
    .toBe('#7a6f66');
  await inReach(page);

  await addWater(page, false);
  await inReach(page);

  // Zoomed out by keys until the sculpted seams join chunks of two levels.
  await scenePanel(page).locator('.scene-view').focus();
  for (let n = 0; n < 10; n++) await page.keyboard.press('Minus');
  await expectLevels(page);

  const kept = await keptState(page);
  await expect(page.getByText('All changes saved.')).toBeVisible();
  await page.reload();
  const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
  await rows.first().getByRole('button', { name: 'Open' }).click();
  const panel = await showScene(page);
  await panel.getByRole('button', { name: 'Fell (fell) 1 object' }).click();
  await viewStarted(page);
  await expect.poll(() => keptState(page)).toEqual(kept);
  await inReach(page);
  expect(errors).toEqual([]);
});
