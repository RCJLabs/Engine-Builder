/**
 * M5.8's gate by touch (D70, docs/specs/movement.md#the-gate), at 360×740 and 390×844 upright and
 * 844×390 sideways: the trail played in the Play panel and walked with the floating stick where the
 * left thumb lands, looked round by a drag on the right half, jumped by its button, and walked to the
 * cairn, every screen in reach. The stick's numbers are the stage's: a 112 px stick, its push from
 * nothing at 12% of its reach to all of it, running past 85%. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { expectFits, game } from './hutScreens.ts';
import { watchHeight } from './jumpHelpers.ts';
import { across, lookByTouch, near, openTrail, settled, stickUntil, walked } from './walkHelpers.ts';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the walk by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('the stick walks the path, a drag looks, the button jumps, and the cairn is reached', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      const box = await openTrail(page, true);
      const jump = box.getByRole('button', { name: 'Jump' });
      // A coarse pointer: the jump button is there before the first touch.
      await expect(jump).toBeVisible();
      await settled(page);
      await expectFits(page);

      await test.step('the stick, pushed 40 px up, walks forward at its share of 2.5 m/s', async () => {
        let fastest = 0;
        const walkedTo = await stickUntil(page, box, 40, (w) => {
          fastest = Math.max(fastest, across(w));
          return w.feet[2] <= 17;
        });
        // 40 of 56 px: (0.714 - 0.12) / 0.88 of a walk.
        expect(near(fastest, 2.5 * ((40 / 56 - 0.12) / 0.88), 0.1)).toBe(true);
        expect(near(walkedTo.feet[0], 0, 0.2)).toBe(true);
        // Let go, it stops, and the stick is gone.
        await settled(page);
        await expect(box.locator('.walk-stick')).toBeHidden();
      });

      await test.step('a drag on the right half looks, 0.3° a pixel', async () => {
        const before = await walked(page);
        await lookByTouch(page, box, 100, 0);
        await expect.poll(async () => (await walked(page)).yaw).toBeCloseTo(before.yaw - 30, 1);
        await lookByTouch(page, box, -100, 0);
        await expect.poll(async () => (await walked(page)).yaw).toBeCloseTo(before.yaw, 1);
      });

      await test.step('the jump button jumps', async () => {
        const before = await settled(page);
        const top = await watchHeight(page);
        await jump.tap();
        await expect.poll(async () => (await top()) - before.feet[1], { intervals: [50] }).toBeGreaterThan(0.3);
        const landed = await settled(page);
        expect(near(landed.feet[1], before.feet[1], 0.1)).toBe(true);
      });

      await test.step('the stick pushed past 85% runs to the cairn, its trigger sent once', async () => {
        let fastest = 0;
        const reached = await stickUntil(page, box, 60, (w) => {
          fastest = Math.max(fastest, across(w));
          return w.zones.includes('cairn/zone');
        });
        expect(near(fastest, 5, 0.2)).toBe(true);
        expect(reached.sent.map((s) => s.object)).toEqual(['cairn/zone']);
        await expect(game(page).getByText('The cairn is reached.')).toBeVisible();
        await settled(page);
        expect((await walked(page)).sent).toEqual([{ object: 'cairn/zone', sent: 'accepted' }]);
      });
      await expectFits(page);
      expect(errors).toEqual([]);
    });
  });
}
