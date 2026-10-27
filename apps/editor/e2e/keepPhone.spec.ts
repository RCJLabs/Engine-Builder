/**
 * M7.1's gate by touch (D83, docs/specs/2d-scenes.md#the-gate), at 360×740 and 390×844 upright and
 * 844×390 sideways, each at a phone's pixel ratio: the keep played in the Play panel. It is drawn at
 * the scale rule's whole scale for the screen's device pixels, with only the palette's colours on
 * screen; a finger's drag pans it, the camera moving by whole art pixels and the world, the bell's
 * button with it, following the finger; and the bell is rung by a tap on its button, 44 px at least.
 * Every screen on the way fits. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { hands } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { expectFits, game } from './hutScreens.ts';
import { coloursIn, openKeep, PALETTE, stage2d } from './keepHelpers.ts';

const RUNG = 'The watch has rung the bell.';

for (const { viewport, dpr } of [
  { viewport: { width: 360, height: 740 }, dpr: 2 },
  { viewport: { width: 390, height: 844 }, dpr: 3 },
  { viewport: { width: 844, height: 390 }, dpr: 3 },
]) {
  test.describe(`the keep by touch, ${viewport.width}×${viewport.height} at ${dpr}×`, () => {
    test.use({ viewport, deviceScaleFactor: dpr, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('drawn whole at the phone’s pixels, panned by a finger and its bell rung by a tap', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = watchErrors(page);
      const box = await openKeep(page, true);
      await box.scrollIntoViewIfNeeded();

      await test.step('drawn at the scale rule’s whole scale for its device pixels, only the palette on screen', async () => {
        const { scaled } = await stage2d(page);
        const [width, height] = await box.evaluate((el) => [el.clientWidth, el.clientHeight]);
        expect(scaled.dpr).toBe(dpr);
        expect(scaled.scale).toBe(Math.max(1, Math.floor(Math.min((width * dpr) / 320, (height * dpr) / 180))));
        expect(scaled.cols).toBe(Math.ceil((width * dpr) / scaled.scale));
        expect(scaled.rows).toBe(Math.ceil((height * dpr) / scaled.scale));
        const colours = await coloursIn(page, box.locator('canvas'));
        expect([...colours.keys()].filter((c) => !PALETTE.includes(c))).toEqual([]);
        expect(colours.size).toBeGreaterThanOrEqual(10);
        await expectFits(page);
      });

      await test.step('a finger dragged left pans the keep right, the world following the finger', async () => {
        const area = await box.boundingBox();
        if (!area) throw new Error('No keep drawn');
        const bell = box.getByRole('button', { name: 'Ring the bell' });
        const [seen, from] = [await stage2d(page), await bell.boundingBox()];
        if (!from) throw new Error('No bell');
        const dx = 60;
        const fingers = await hands(page);
        try {
          // Clear of the bell: up in the sky, right of the gatehouse.
          await fingers.press(1, area.x + area.width * 0.75, area.y + area.height * 0.2);
          await fingers.slide(1, -dx, 0);
          await fingers.lift(1);
        } finally {
          await fingers.close();
        }
        const { scale } = seen.scaled;
        await expect
          .poll(async () => (await stage2d(page)).camera[0])
          .toBe(Math.round(seen.camera[0] + (dx * dpr) / scale));
        const to = await bell.boundingBox();
        if (!to) throw new Error('No bell');
        // Within an art pixel of the finger's 60 CSS pixels: the camera moves by whole ones.
        expect(Math.abs(from.x - dx - to.x)).toBeLessThanOrEqual(scale / dpr);
      });

      await test.step('the bell rung by a tap on its button, 44 px at least', async () => {
        const bell = box.getByRole('button', { name: 'Ring the bell' });
        const at = await bell.boundingBox();
        if (!at) throw new Error('No bell');
        expect(Math.min(at.width, at.height)).toBeGreaterThanOrEqual(44);
        await bell.tap();
        await expect(game(page).getByText(RUNG)).toBeVisible();
        expect((await stage2d(page)).used).toEqual([{ path: 'bell', sent: 'accepted' }]);
        await expectFits(page);
      });

      expect(errors).toEqual([]);
    });
  });
}
