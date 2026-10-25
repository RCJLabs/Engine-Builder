/**
 * M6.2's gate by touch (D74, docs/specs/navigation.md#the-gate), at 360×740 and 390×844 upright and
 * 844×390 sideways: the square played in the Play panel and crossed by a tap. A tap on the cobbles
 * before the well walks the player along Detour's corners with a ring where they go; the stick takes
 * over at once and the ring goes; tapped again, the player walks round stall 3 to the ring and
 * stops. Every target 44 px, nothing off the screen. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { expectFits } from './hutScreens.ts';
import { across, BY_WELL, nav, openSquare, tapAt } from './squareHelpers.ts';
import { settled, stickUntil, walked } from './walkHelpers.ts';

/** tapPath.ts's ARRIVE_M, and the slack of a frame's step at a walk. */
const ARRIVE = 0.3 + 0.1;

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the square by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('crossed by a tap, the stick taking over, and tapped again to the well', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      const square = await openSquare(page, true);
      const start = await settled(page);

      await test.step('a tap before the well: a path along the navmesh, and the player walking it', async () => {
        await tapAt(page, square, BY_WELL);
        await expect.poll(async () => (await nav(page)).tap?.corners.length ?? 0).toBeGreaterThan(0);
        const tapped = (await nav(page)).tap;
        expect(across(tapped?.target ?? [99, 99, 99], BY_WELL)).toBeLessThan(0.2);
        await expect.poll(async () => across((await walked(page)).feet, start.feet)).toBeGreaterThan(1);
        await expectFits(page);
      });

      await test.step('the stick takes over at once: the path and its ring gone', async () => {
        const from = (await walked(page)).feet;
        await stickUntil(page, square, 40, (w) => across(w.feet, from) > 0.5);
        expect((await nav(page)).tap).toBeNull();
        await settled(page);
      });

      await test.step('tapped again: round stall 3 to the ring, and stopped there', async () => {
        await tapAt(page, square, BY_WELL);
        await expect.poll(async () => (await nav(page)).tap !== null).toBe(true);
        await expect.poll(async () => (await nav(page)).tap, { timeout: 60_000 }).toBeNull();
        const there = await settled(page);
        expect(across(there.feet, BY_WELL), JSON.stringify(there.feet)).toBeLessThan(ARRIVE);
        await expectFits(page);
      });
      expect(errors).toEqual([]);
    });
  });
}
