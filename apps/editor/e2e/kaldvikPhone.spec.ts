/**
 * Proof #2's gate by touch (M6.10, D82, docs/specs/kaldvik.md#the-gate): Kaldvík's web export on a
 * phone upright and sideways, walked with the floating stick, a look drag and taps. Gudrun's talk at
 * her booth and a flatbread bought from her shop; Halvard's talk at the gate; the hall's door. Each
 * screen on the way with nothing past the edges, no target under 44 px and nothing axe finds.
 * Untested for feel.
 */
import { expect, type Locator, test } from '@playwright/test';
import { hands } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { expectFits, game, press } from './hutScreens.ts';
import { AT, goVia, IN_AT_THE_GATE, startKaldvik, talkTo } from './kaldvikHelpers.ts';
import { walkSteer } from './postHelpers.ts';
import { arrived, talk, useAt } from './templates3dHelpers.ts';

const tap = (button: Locator) => button.tap();

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`Kaldvík, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('a trade with Gudrun, Halvard’s talk and the hall’s door, by touch', async ({ page }) => {
      test.setTimeout(480_000);
      const errors = watchErrors(page);
      const view = await startKaldvik(page, tap);
      await expectFits(page);
      const fingers = await hands(page);
      const steer = walkSteer(page, view, fingers);
      const dialog = game(page).getByRole('dialog');
      try {
        await test.step('Gudrun’s talk, and a flatbread from her shop', async () => {
          await goVia(page, steer, [[-44, 2.5, 12]]);
          await talkTo(page, steer, 'gudrun');
          await expect(dialog.getByText(/^Bread, fish, a good stone/)).toBeVisible();
          await expectFits(page);
          await press(page, dialog.getByRole('button', { name: 'Let me see' }), true);
          const bread = dialog.getByRole('button', { name: /^Flatbread: \d+, \d+ left$/ });
          await expect(bread).toBeVisible();
          await expectFits(page);
          const left = Number(/(\d+) left$/.exec((await bread.textContent()) ?? '')?.[1]);
          await press(page, bread, true);
          await expect(bread).toHaveText(new RegExp(`, ${left - 1} left$`));
          await press(page, dialog.getByRole('button', { name: 'Leave' }), true);
          await expect(dialog).toBeHidden();
        });

        await test.step('Halvard’s talk at the gate', async () => {
          await goVia(page, steer, [[-30, 5, -1.2], IN_AT_THE_GATE[0]]);
          await talkTo(page, steer, 'halvard');
          await expect(dialog.getByText(/^Outlaws camp in the woods/)).toBeVisible();
          await expectFits(page);
          await talk(page, tap, ['Keep watching']);
        });

        await test.step('the hall’s door', async () => {
          await goVia(page, steer, [IN_AT_THE_GATE[1]]);
          await useAt(page, steer, 'hall-door', AT.hallDoor);
          await arrived(page, 'hall');
          await expect(page.getByRole('application', { name: 'The hall' })).toBeVisible();
          await expectFits(page);
        });
      } finally {
        await fingers.close();
      }
      expect(errors).toEqual([]);
    });
  });
}
