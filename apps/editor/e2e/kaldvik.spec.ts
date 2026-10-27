/**
 * Proof #2's gate by keys (M6.10, D82, docs/specs/kaldvik.md#the-gate): Kaldvík's web export played
 * from New game to its ending by keys and the mouse. Ragnhild's ask taken in the hall; out through
 * the gate and over the shore to the howe on the knoll; Hallkel and his two fought with F held; the
 * key from Hallkel's body and the silver from the chest; back to the hall to lay it at her seat. The
 * export stays within its size budget. Untested for feel.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { keySteer, searchAll, takeAllAndClose } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { topScreen } from './hutScreens.ts';
import {
  AT,
  BUDGET,
  exportBytes,
  goVia,
  IN_AT_THE_GATE,
  startKaldvik,
  TO_THE_HOWE,
  TO_THE_SEAT,
  talkTo,
} from './kaldvikHelpers.ts';
import { arrived, fightWith, talk, useAt } from './templates3dHelpers.ts';

// A small window: the software renderer CI has draws Kaldvík's shore at about 20 fps at 800×600 and
// 9 at 1280×900 (2026-10-27), and the walk slows with its frames, running 4.3 m/s against 2.9.
test.use({ viewport: { width: 800, height: 600 }, actionTimeout: 20_000 });

const click = (button: Locator) => button.click();

/** F held through the fight, as a player holds it to swing again and again. */
async function fightByKeys(page: Page, view: Locator, foes: readonly string[]): Promise<void> {
  const fight = fightWith(page, keySteer(page, view));
  await view.focus();
  await page.keyboard.down('KeyF');
  try {
    await fight(foes);
  } finally {
    await page.keyboard.up('KeyF');
  }
}

test('Kaldvík by keys: from New game to the silver laid at Ragnhild’s seat', async ({ page }) => {
  // 4.3 minutes alone and 6.8 beside the phone specs on two workers (2026-10-27): its 250 m are
  // walked at the frames a software renderer draws.
  test.setTimeout(900_000);
  const errors = watchErrors(page);
  const view = await startKaldvik(page);
  await view.focus();
  const steer = keySteer(page, view);

  await test.step('Ragnhild’s ask, in the hall', async () => {
    await goVia(page, steer, IN_AT_THE_GATE);
    await useAt(page, steer, 'hall-door', AT.hallDoor);
    await arrived(page, 'hall');
    await goVia(page, steer, TO_THE_SEAT);
    await talkTo(page, steer, 'ragnhild');
    await talk(page, click, ['I’ll bring it back']);
    await goVia(page, steer, [...TO_THE_SEAT].reverse());
    await useAt(page, steer, 'out', AT.hallOut);
    await arrived(page, 'shore');
  });

  await test.step('over the shore to the howe, and its three fought', async () => {
    await goVia(page, steer, TO_THE_HOWE);
    await useAt(page, steer, 'howe-door', AT.howeDoor);
    await arrived(page, 'howe');
    await fightByKeys(page, view, ['hallkel', 'vigi', 'orm']);
  });

  await test.step('the key from Hallkel, the silver from the chest', async () => {
    await searchAll(page, steer, click);
    await useAt(page, steer, 'chest', AT.chest);
    await takeAllAndClose(page, click);
    await useAt(page, steer, 'out', AT.howeOut);
    await arrived(page, 'shore');
  });

  await test.step('home, and the silver laid at her seat', async () => {
    await goVia(page, steer, [...TO_THE_HOWE].reverse());
    await useAt(page, steer, 'hall-door', AT.hallDoor);
    await arrived(page, 'hall');
    await goVia(page, steer, TO_THE_SEAT);
    await talkTo(page, steer, 'ragnhild');
    await talk(page, click, ['Lay the silver at her seat']);
    await expect(topScreen(page).getByText('The silver is home, and the steading sleeps.')).toBeVisible();
  });
  expect(errors).toEqual([]);
});

test('the web export stays within its size budget', () => {
  expect(exportBytes()).toBeLessThanOrEqual(BUDGET);
});
