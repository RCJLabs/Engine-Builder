/**
 * M6.7's gate by touch (D79, docs/specs/radiant.md#the-gate), at 360×740 and 390×844 upright and
 * 844×390 sideways: the hollows played in the Play panel, the board read by a tap on the prompt, the
 * compass on the barrow's door, the journal naming the barrow, and the Map's pin at its door, a 44 px
 * target that says the objective. Every screen in reach.
 */
import { expect, type Locator, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { offered, promptButton } from './glenHelpers.ts';
import { marksAt, openHollows } from './hollowsHelpers.ts';
import { expectFits } from './hutScreens.ts';
import { compass, entry, openScreen, pins } from './markerHelpers.ts';
import { settled } from './walkHelpers.ts';

const tap = (button: Locator) => button.tap();
const TEXT = 'Take the supplies from the Crate in The barrow';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the hollows by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('the board read by a tap, the compass, the journal and the Map naming the barrow', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      const green = await openHollows(page, true);
      await settled(page);

      await test.step('the board read by a tap: the barrow’s crate, behind its door', async () => {
        await offered(page, 'board');
        await promptButton(green).tap();
        await marksAt(page, [['cache', 'barrow-door']]);
        await expect(compass(page)).toBeVisible();
        await expectFits(page);
      });

      await test.step('the journal names the barrow and its crate', async () => {
        const journal = await openScreen(page, 'Journal', tap);
        await expect(entry(journal, 'Supplies')).toContainText(TEXT);
        await expectFits(page);
        await tap(journal.getByRole('button', { name: 'Close' }));
        await expect(journal).toHaveCount(0);
      });

      await test.step('the Map’s pin at the barrow’s door, a 44 px target that says the objective', async () => {
        const map = await openScreen(page, 'Map', tap);
        await expect
          .poll(async () => (await pins(map)).filter((pin) => pin.kind !== 'player'))
          .toEqual([{ kind: 'door', objective: 'cache', at: [-6, 1.1] }]);
        const pin = map.getByRole('button', { name: TEXT });
        const box = await pin.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
        await pin.tap();
        await expect(map.locator('figcaption')).toHaveText(TEXT);
        await expectFits(page);
        await tap(map.getByRole('button', { name: 'Close' }));
        await expect(map).toHaveCount(0);
      });
      expect(errors).toEqual([]);
    });
  });
}
