/**
 * M7.3's gate by touch (D85, docs/specs/rooms.md#the-gate), at 360×740 and 390×844 upright and 844×390
 * sideways, each at a phone's pixel ratio: the tower played in the Play panel. It is drawn at the scale
 * rule's whole scale for the screen's device pixels, only the palette's colours on screen; a finger's drag
 * moves the camera along the night and keeps it within it; and the bell rings by a tap on its button, 44
 * px at least, all three folk climbing down to the hall. Every screen on the way fits. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { hands } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { expectFits, game } from './hutScreens.ts';
import { coloursIn, PALETTE, stage2d } from './keepHelpers.ts';
import { climbs, folk, openTower, watchFolk } from './towerHelpers.ts';

for (const { viewport, dpr } of [
  { viewport: { width: 360, height: 740 }, dpr: 2 },
  { viewport: { width: 390, height: 844 }, dpr: 3 },
  { viewport: { width: 844, height: 390 }, dpr: 3 },
]) {
  test.describe(`the tower by touch, ${viewport.width}×${viewport.height} at ${dpr}×`, () => {
    test.use({ viewport, deviceScaleFactor: dpr, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('drawn whole at the phone’s pixels, dragged, and the bell rung by a tap', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = watchErrors(page);
      const box = await openTower(page, true);
      await box.scrollIntoViewIfNeeded();

      await test.step('drawn at the scale rule’s whole scale for its device pixels, only the palette on screen', async () => {
        const { scaled } = await stage2d(page);
        const [width, height] = await box.evaluate((el) => [el.clientWidth, el.clientHeight]);
        expect(scaled.dpr).toBe(dpr);
        expect(scaled.scale).toBe(Math.max(1, Math.floor(Math.min((width * dpr) / 208, (height * dpr) / 176))));
        const colours = await coloursIn(page, box.locator('canvas'));
        expect([...colours.keys()].filter((c) => !PALETTE.includes(c))).toEqual([]);
        expect(colours.size).toBeGreaterThanOrEqual(10);
        await expectFits(page);
      });

      await test.step('a finger’s drag moves the camera along the night, within it', async () => {
        const area = await box.boundingBox();
        if (!area) throw new Error('No tower drawn');
        const before = (await stage2d(page)).camera;
        const fingers = await hands(page);
        try {
          await fingers.press(1, area.x + area.width * 0.5, area.y + area.height * 0.5);
          await fingers.slide(1, 80, 0);
          await fingers.lift(1);
        } finally {
          await fingers.close();
        }
        await page.waitForTimeout(200);
        const { camera, scaled } = await stage2d(page);
        // The night is 320 art pixels wide: narrower than that, the view moves along it, the other way to the
        // finger, and stays within it; as wide or wider, it stays at the night's middle.
        if (scaled.cols >= 320) expect(camera[0]).toBe(before[0]);
        else {
          expect(camera[0]).toBeLessThan(before[0]);
          expect(camera[0] - Math.floor(scaled.cols / 2)).toBeGreaterThanOrEqual(0);
          expect(camera[0] + Math.ceil(scaled.cols / 2)).toBeLessThanOrEqual(320);
        }
      });

      await test.step('the bell rung by a tap on its button, 44 px at least, the folk down to the hall', async () => {
        const bell = box.getByRole('button', { name: 'Ring the bell' });
        await bell.scrollIntoViewIfNeeded();
        const at = await bell.boundingBox();
        if (!at) throw new Error('No bell');
        expect(Math.min(at.width, at.height)).toBeGreaterThanOrEqual(44);
        await bell.tap();
        await expect(game(page).getByText('The bell has rung.')).toBeVisible();
        await expect(game(page).getByText('The warden is in the hall.')).toBeVisible({ timeout: 90_000 });
        for (const f of await folk(page)) if (f.floors) expect(climbs(f.floors), f.actor).toBe(true);
        expect(await watchFolk(page, 10)).toEqual([]);
        await expectFits(page);
      });

      expect(errors).toEqual([]);
    });
  });
}
