/**
 * M4.6's gate on phones (D56), upright at 360 and 390 px and held sideways: the drift flown to its
 * exit by touch through its map widget in the Play panel behind More, the map and an event each in
 * reach with nothing past the edges and nothing axe finds; and the World panel's map in the
 * inspector sheet, the sector's preview in reach and the valley's van dragged by a finger, which
 * Undo takes back.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { expectFits, topScreen } from './hutScreens.ts';
import { stored } from './kitHelpers.ts';
import {
  DRIFT,
  expectMapLaidOut,
  fixtureJson,
  flyHome,
  importFolder,
  showWorld,
  startDrift,
  VALLEY,
} from './mapHelpers.ts';

/** A finger pressed on a node and moved across the board to its middle, where the page would scroll. */
async function dragByTouch(page: Page, node: Locator, board: Locator): Promise<void> {
  await node.scrollIntoViewIfNeeded();
  const [from, onto] = [await node.boundingBox(), await board.boundingBox()];
  if (!from || !onto) throw new Error('Nothing to drag');
  const [x0, y0] = [from.x + from.width / 2, from.y + from.height / 2];
  const [x1, y1] = [onto.x + onto.width / 2, onto.y + onto.height / 2];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x0 + ((x1 - x0) * i) / 8, y: y0 + ((y1 - y0) * i) / 8 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function expectInReach(page: Page): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="inspector"]')).toEqual([]);
  await expectNoAxeIssues(page);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the drift and the valley, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('the drift flown to its exit by touch through its map widget, every screen in reach', async ({ page }) => {
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      await importFolder(page, DRIFT, 'the-drift', 'The drift');
      await startDrift(page, true);
      await expectMapLaidOut(page);
      const flown = await flyHome(page, true, {
        atStart: async () => {
          await expect(topScreen(page).locator('.eb-map-picked').getByRole('button').first()).toHaveText(/^Jump · /);
          await expectFits(page);
        },
        // An event over the map, in reach as the map is.
        inEvent: () => expectFits(page),
      });
      expect(flown.presses).toBeGreaterThan(14);
      expect(flown.events).toBeGreaterThan(0);
      await expect(topScreen(page).getByText('The game is over.')).toBeVisible();
      await expectFits(page);
      expect(errors).toEqual([]);
    });

    test('the sector’s preview in the inspector sheet, and the valley’s van dragged by a finger and undone', async ({
      page,
    }) => {
      test.setTimeout(150_000);
      const errors = watchErrors(page);
      await importFolder(page, DRIFT, 'the-drift', 'The drift');
      let world = await showWorld(page);
      await world.getByRole('button', { name: /^The sector/ }).tap();
      const preview = page.getByRole('region', { name: 'What The sector makes' });
      await expect(preview.getByRole('listitem').filter({ hasText: 'kept in 300 of 300' })).toHaveCount(4);
      await preview.getByRole('button', { name: 'Next seed' }).tap();
      await expect(preview.getByRole('region', { name: 'The sector, seed 2' })).toBeVisible();
      await expectInReach(page);

      await importFolder(page, VALLEY, 'the-valley', 'The valley');
      world = await showWorld(page);
      await world.getByRole('button', { name: /^The valley/ }).tap();
      const map = page.getByRole('region', { name: 'Map valley' });
      const board = map.getByRole('region', { name: 'The valley', exact: true });
      await expect(board).toBeVisible();
      await expectInReach(page);
      const valley = fixtureJson(VALLEY, 'records/map/valley.json');
      await dragByTouch(page, board.locator('[data-node="van"]'), board);
      await expect
        .poll(
          async () =>
            ((await stored(page, 'valley', 'records/map/valley.json')) as { nodes: { x: number }[] } | null)?.nodes[0]
              ?.x,
        )
        .toBeGreaterThan(30);
      await page.getByRole('button', { name: /^Undo: Move van to \d+, \d+ in valley$/ }).tap();
      await expect.poll(() => stored(page, 'valley', 'records/map/valley.json')).toEqual(valley);
      expect(errors).toEqual([]);
    });
  });
}
