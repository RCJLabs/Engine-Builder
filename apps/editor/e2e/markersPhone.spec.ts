/**
 * M6.6's gate by touch (D78, docs/specs/markers.md#the-gate), at 360×740 and 390×844 upright and
 * 844×390 sideways: the glen played in the Play panel, the compass across the top of the walk and
 * clear of Jump and the prompt, taking no touch; the rope taken by the prompt, and the lamp shown at
 * the bothy's door; Find your feet tracked from the journal by a tap, and the gate shown; the Map
 * screen's pins, a target's 44 px and more, its objective said when tapped; and the setting hiding
 * the compass and the markers. Every screen in reach. Untested for feel.
 */
import { expect, type Locator, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { offered, openGlen, promptButton } from './glenHelpers.ts';
import { expectFits } from './hutScreens.ts';
import { compass, markersSetting, openScreen, pins, pointsAt, shown, track } from './markerHelpers.ts';
import { settled } from './walkHelpers.ts';

const tap = (button: Locator) => button.tap();
const GATE = ['gate', null, [3, 0.5, -2.5]];

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the glen’s markers by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('the compass clear of the controls, Track by a tap, the Map screen’s pins and the setting', async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      const glen = await openGlen(page, true);
      await settled(page);

      await test.step('the compass across the top, inside the view, clear of Jump and the prompt', async () => {
        await pointsAt(page, [['rope', null, [0, 0.5, 6.5]], GATE]);
        await offered(page, 'rope');
        await expect(compass(page)).toBeVisible();
        const [strip, view, jump, prompt] = await Promise.all([
          compass(page).boundingBox(),
          glen.boundingBox(),
          glen.getByRole('button', { name: 'Jump' }).boundingBox(),
          promptButton(glen).boundingBox(),
        ]);
        if (!strip || !view || !jump || !prompt) throw new Error('Something isn’t drawn');
        expect(strip.x).toBeGreaterThanOrEqual(view.x);
        expect(strip.x + strip.width).toBeLessThanOrEqual(view.x + view.width);
        expect(strip.y).toBeGreaterThanOrEqual(view.y);
        for (const control of [jump, prompt]) expect(strip.y + strip.height).toBeLessThan(control.y);
        // The layer over the view takes no touch: the stick and the look drags reach the canvas.
        const layer = glen.locator('.walk-markers');
        expect(await layer.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
        await expectFits(page);
      });

      await test.step('the prompt tapped takes the rope: the lamp, at the bothy’s door', async () => {
        await promptButton(glen).tap();
        await pointsAt(page, [['lamp', 'bothy-door', [-6, 0.5, -3.9]]]);
      });

      await test.step('Find your feet tracked from the journal by a tap: the gate', async () => {
        await track(page, 'Find your feet', tap);
        await pointsAt(page, [GATE]);
      });

      await test.step('the Map screen: the gate’s pin a 44 px target, its objective said when tapped', async () => {
        const map = await openScreen(page, 'Map', tap);
        await expect.poll(async () => (await pins(map)).map((pin) => pin.kind)).toEqual(['player', 'target']);
        const gate = map.getByRole('button', { name: 'Look over the gate' });
        const box = await gate.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
        await gate.tap();
        await expect(map.locator('figcaption')).toHaveText('Look over the gate');
        await expectFits(page);
        await map.getByRole('button', { name: 'Close' }).tap();
        await expect(map).toHaveCount(0);
      });

      await test.step('Quest markers off: no compass and nothing shown', async () => {
        await markersSetting(page, false, tap);
        await expect.poll(() => shown(page)).toEqual([]);
        await expect(compass(page)).toBeHidden();
        await expectFits(page);
      });
      expect(errors).toEqual([]);
    });
  });
}
