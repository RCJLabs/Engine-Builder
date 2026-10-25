/**
 * M5.10's snapping gate by touch (D72, docs/specs/streaming.md#snapping), at 360×740 and 390×844
 * upright and 844×390 sideways: the hut snapping.spec.ts builds by mouse, built with one finger,
 * each piece dragged towards the floor's edge until it latches; Drop tapped to put the roof back on
 * the walls; the grid's step chosen; and the toolbar, its Grid and Drop among it, in reach. The 12 px
 * a latch reaches is a first guess until a phone builds the hut.
 */
import { expect, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { createProject } from './kitHelpers.ts';
import { addKitTo, buildHut, dragUntil, expectAt } from './snappingHelpers.ts';
import { newSpaceFile, scenePanel, showScene } from './spaceHelpers.ts';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`a hut snapped by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('latched flush and touching, the grid at 1 m, and Drop tapped', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await createProject(page, 'Hut works');
      await addKitTo(page, true);
      await showScene(page);
      await newSpaceFile(page, 'space', 'Hut');
      const panel = scenePanel(page);
      await expectNothingOffscreen(page);
      expect(await smallTargets(page, '[data-panel="scene"]')).toEqual([]);
      await expectNoAxeIssues(page);

      const ids = await buildHut(page, true, (title, body) => test.step(title, body));

      await test.step('the grid at 1 m, a move landing on a whole metre, and Drop tapped', async () => {
        await panel.getByLabel('Grid').selectOption('1');
        // First drawn at 3.5 m or more: a 1 m step from 2.5 puts it at 4, a 0.5 m one at 3.5.
        await dragUntil(page, 'move-y', ids.roof, 1, (now) => (now.box?.min[1] ?? 0) >= 3.5, true);
        await expectAt(page, ids.roof, [0, 4, 0]);
        await panel.getByRole('button', { name: 'Drop' }).tap();
        await expectAt(page, ids.roof, [0, 2.5, 0]);
        await expectNothingOffscreen(page);
        expect(await smallTargets(page, '[data-panel="scene"]')).toEqual([]);
      });

      expect(errors).toEqual([]);
    });
  });
}
