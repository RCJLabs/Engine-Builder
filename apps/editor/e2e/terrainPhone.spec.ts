/**
 * M5.3's gate by touch (D65), at 360×740 and 390×844 upright and 844×390 sideways: the fell
 * terrain.spec.ts makes by mouse and keys, made with fingers. A terrain added from the Scene
 * panel's tools, sculpted with each brush and painted with each layer by one finger, its form in
 * the inspector's sheet upright and a tab sideways, a plane given water, a pinch out until chunks
 * of two levels meet at the sculpted seams with no crack, every screen in reach, and all of it
 * after a reload.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { showInspector } from './componentHelpers.ts';
import { createProject } from './kitHelpers.ts';
import { showProject } from './ludus.ts';
import { newSpaceFile, showScene, viewStarted } from './spaceHelpers.ts';
import { lowerSheet } from './templateHelpers.ts';
import {
  addTerrain,
  addWater,
  expectLevels,
  fell,
  keptState,
  paint,
  pinchIn,
  sculpt,
  terrainTools,
} from './terrainHelpers.ts';

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
  test.describe(`terrain by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('sculpted, painted, watered, seen at two levels and kept', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await createProject(page, 'Fell works');
      await showScene(page);
      await newSpaceFile(page, 'space', 'Fell');
      await addTerrain(page, 129, true);
      await expectInReach(page);
      await sculpt(page, true);
      await paint(page, true);
      await expectInReach(page);

      // The terrain's form, from the tools: the inspector's sheet upright, its tab sideways.
      await terrainTools(page).getByRole('button', { name: 'Terrain settings' }).tap();
      const form = await showInspector(page, true);
      await expect(form.getByRole('heading', { name: 'Terrain' })).toBeVisible();
      await form.getByLabel('Layer 4').fill('Ice');
      await expect
        .poll(async () => ((await fell(page))?.terrain as { layers: { name: string }[] })?.layers[3]?.name)
        .toBe('Ice');
      await expectInReach(page);

      await addWater(page, true);
      await expectInReach(page);
      await lowerSheet(page);
      await showScene(page);

      // A pinch out to about nine times as far: the sculpted seams join chunks of two levels.
      await pinchIn(page, 300, 32);
      await expectLevels(page);

      const kept = await keptState(page);
      await page.reload();
      await showProject(page);
      const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
      await rows.first().getByRole('button', { name: 'Open' }).tap();
      const panel = await showScene(page);
      await panel.getByRole('button', { name: 'Fell (fell) 1 object' }).tap();
      await viewStarted(page);
      await expect.poll(() => keptState(page)).toEqual(kept);
      await expectInReach(page);
      expect(errors).toEqual([]);
    });
  });
}
