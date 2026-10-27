/**
 * M7.4's gate by touch (D86, docs/specs/stages.md#the-gate), at 360×740 and 390×844 upright and 844×390
 * sideways, each at a phone's pixel ratio: the boarding deck played in the Play panel, drawn by
 * Space-Wrecked's battle board as a stage in its worker, at the pixel ratio the stage is given (2 at
 * most); the board turned by one finger's drag and by two fingers' twist, the alarm's button going
 * with its tile; and the alarm sounded by a tap on its button, 44 px at least, the HUD showing its SVG.
 * Every screen on the way fits. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { code, expectBoardColours, moved, openBoarding, rectOf, SOUNDING } from './boardingHelpers.ts';
import { hands } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { expectFits, game } from './hutScreens.ts';
import { stage2d } from './keepHelpers.ts';

for (const { viewport, dpr } of [
  { viewport: { width: 360, height: 740 }, dpr: 2 },
  { viewport: { width: 390, height: 844 }, dpr: 3 },
  { viewport: { width: 844, height: 390 }, dpr: 3 },
]) {
  test.describe(`the boarding deck by touch, ${viewport.width}×${viewport.height} at ${dpr}×`, () => {
    test.use({ viewport, deviceScaleFactor: dpr, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('drawn by its stage, turned by a drag and a twist, and the alarm sounded by a tap', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = watchErrors(page);
      const box = await openBoarding(page, true);
      await box.scrollIntoViewIfNeeded();
      const canvas = box.locator('canvas.eb-stage-canvas');
      const alarm = box.getByRole('button', { name: 'Sound the alarm' });

      await test.step('drawn in its worker at the pixel ratio it is given, in Space-Wrecked’s colours', async () => {
        expect((await stage2d(page)).scaled.dpr).toBe(Math.min(2, dpr));
        expect(await code(page)).toMatchObject({ stage: 'battle', boxed: ['alarm'], unboxed: [] });
        await expectBoardColours(page, canvas);
        await expectFits(page);
      });

      await test.step('turned by a finger’s drag and by two fingers’ twist, the alarm’s button with it', async () => {
        const area = await rectOf(canvas);
        let before = await rectOf(alarm);
        const fingers = await hands(page);
        try {
          // Away from the button, so the touches are the canvas's.
          await fingers.press(1, area.x + area.width * 0.15, area.y + area.height * 0.85);
          await fingers.slide(1, 60, -10);
          await fingers.lift(1);
          before = await moved(alarm, before);
          await fingers.press(1, area.x + area.width * 0.15, area.y + area.height * 0.8);
          await fingers.press(2, area.x + area.width * 0.45, area.y + area.height * 0.8);
          await fingers.slide(2, -20, -60);
          await fingers.lift(2);
          await fingers.lift(1);
          await moved(alarm, before);
        } finally {
          await fingers.close();
        }
        expect((await code(page))?.error).toBeUndefined();
      });

      await test.step('the alarm sounded by a tap on its button, 44 px at least, the HUD showing its SVG', async () => {
        const at = await rectOf(alarm);
        expect(Math.min(at.width, at.height)).toBeGreaterThanOrEqual(44);
        await alarm.tap();
        await expect(game(page).getByText(SOUNDING)).toBeVisible();
        const hud = game(page).getByRole('img', { name: 'The alarm' });
        await expect(hud).toBeVisible();
        await expect.poll(() => hud.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(24);
        await expectFits(page);
      });

      expect(errors).toEqual([]);
    });
  });
}
