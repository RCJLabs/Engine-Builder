/**
 * M5.10's streaming gate by touch (D72, docs/specs/streaming.md#the-gate), at 360×740 and 390×844
 * upright and 844×390 sideways: the moor played in the Play panel and run up its road by the
 * floating stick, two cells crossed and their rings built, the cairn's zone heard once its cell is
 * built, and the chest on the road taken by tapping the prompt. Every screen in reach. Untested for
 * feel, and on no phone yet.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { acted, offered, promptButton } from './glenHelpers.ts';
import { expectFits, game } from './hutScreens.ts';
import { cells, openMoor, recordRings } from './streamingHelpers.ts';
import { settled, stickUntil, walked } from './walkHelpers.ts';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the moor by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('the stick runs the road, its rings built as it goes, and the prompt tapped takes the chest', async ({
      page,
    }) => {
      test.setTimeout(400_000);
      const errors = watchErrors(page);
      const moor = await openMoor(page, true);
      await settled(page);
      await expectFits(page);
      const first = await cells(page);
      expect(first.cell).toEqual([0, 0]);
      expect(first.waiting).toBe(0);
      expect(first.zones).toBe(0);

      await test.step('the stick pushed past its run: two cells crossed, the cairn’s zone heard', async () => {
        const rings = await recordRings(page);
        await stickUntil(page, moor, 60, (w) => w.feet[2] <= -118.5);
        expect((await rings()).map((r) => r.cell)).toEqual([
          [0, 0],
          [0, -1],
          [0, -2],
        ]);
        expect((await walked(page)).sent).toEqual([{ object: 'cairn-zone', sent: 'accepted' }]);
        await expect(game(page).getByText('The cairn is reached.')).toBeVisible();
      });

      await test.step('on to the chest, which stops the walk: the prompt tapped takes it', async () => {
        await stickUntil(page, moor, 30, (w) => w.feet[2] <= -126.8);
        await settled(page);
        await offered(page, 'chest');
        const prompt = promptButton(moor);
        await expect(prompt).toHaveText('Take');
        await prompt.tap();
        await expect.poll(async () => (await acted(page)).taken).toEqual(['chest']);
        await expect(game(page).getByText('Lantern 1')).toBeVisible();
        await expectFits(page);
      });

      expect(errors).toEqual([]);
    });
  });
}
