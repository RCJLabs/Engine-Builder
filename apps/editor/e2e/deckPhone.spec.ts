/**
 * M7.2's gate by touch (D84, docs/specs/tilemaps.md#the-gate), at 360×740 and 390×844 upright and
 * 844×390 sideways, each at a phone's pixel ratio: the boarding deck played in the Play panel. It is
 * drawn at the scale rule's whole scale for the screen's device pixels, only the palette's colours on
 * screen; a finger's drag keeps the camera within the deck, which the view holds whole; and the alarm
 * sounds by a tap on its button, 44 px at least, both crew going to the airlock on four-way routes.
 * Every screen on the way fits. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { hands } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { fourWay, openDeck, walkers } from './deckHelpers.ts';
import { expectFits, game } from './hutScreens.ts';
import { coloursIn, PALETTE, stage2d } from './keepHelpers.ts';

for (const { viewport, dpr } of [
  { viewport: { width: 360, height: 740 }, dpr: 2 },
  { viewport: { width: 390, height: 844 }, dpr: 3 },
  { viewport: { width: 844, height: 390 }, dpr: 3 },
]) {
  test.describe(`the deck by touch, ${viewport.width}×${viewport.height} at ${dpr}×`, () => {
    test.use({ viewport, deviceScaleFactor: dpr, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('drawn whole at the phone’s pixels, dragged, and the alarm sounded by a tap', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = watchErrors(page);
      const box = await openDeck(page, true);
      await box.scrollIntoViewIfNeeded();

      await test.step('drawn at the scale rule’s whole scale for its device pixels, only the palette on screen', async () => {
        const { scaled } = await stage2d(page);
        const [width, height] = await box.evaluate((el) => [el.clientWidth, el.clientHeight]);
        expect(scaled.dpr).toBe(dpr);
        expect(scaled.scale).toBe(Math.max(1, Math.floor(Math.min((width * dpr) / 208, (height * dpr) / 112))));
        const colours = await coloursIn(page, box.locator('canvas'));
        expect([...colours.keys()].filter((c) => !PALETTE.includes(c))).toEqual([]);
        expect(colours.size).toBeGreaterThanOrEqual(10);
        await expectFits(page);
      });

      await test.step('a finger’s drag keeps the camera within the deck, which the view holds whole', async () => {
        const area = await box.boundingBox();
        if (!area) throw new Error('No deck drawn');
        const before = (await stage2d(page)).camera;
        const fingers = await hands(page);
        try {
          await fingers.press(1, area.x + area.width * 0.2, area.y + area.height * 0.2);
          await fingers.slide(1, -60, 30);
          await fingers.lift(1);
        } finally {
          await fingers.close();
        }
        await page.waitForTimeout(200);
        const { camera, scaled } = await stage2d(page);
        // The deck is 208 by 112 art pixels: on an axis the view is wider, the camera stays at its middle.
        if (scaled.cols >= 208) expect(camera[0]).toBe(before[0]);
        if (scaled.rows >= 112) expect(camera[1]).toBe(before[1]);
        expect(camera[0]).toBeGreaterThanOrEqual(0);
        expect(camera[1]).toBeGreaterThanOrEqual(0);
      });

      await test.step('the alarm sounded by a tap on its button, 44 px at least, the crew to the airlock', async () => {
        const alarm = box.getByRole('button', { name: 'Sound the alarm' });
        const at = await alarm.boundingBox();
        if (!at) throw new Error('No alarm');
        expect(Math.min(at.width, at.height)).toBeGreaterThanOrEqual(44);
        await alarm.tap();
        await expect(game(page).getByText('The alarm is sounding.')).toBeVisible();
        await expect(game(page).getByText('Ines can see the hatch.')).toBeVisible({ timeout: 90_000 });
        await expect(game(page).getByText('Oren can see the hatch.')).toBeVisible({ timeout: 90_000 });
        for (const walker of await walkers(page))
          if (walker.route) expect(fourWay(walker.route), walker.actor).toBe(true);
        await expectFits(page);
      });

      expect(errors).toEqual([]);
    });
  });
}
