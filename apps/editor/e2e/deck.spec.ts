/**
 * M7.2's gate by mouse and keys (D84, docs/specs/tilemaps.md#the-gate): the boarding deck played in the
 * Play panel at 1280 wide. Its tilemap is drawn at the scale rule's whole scale in the palette's colours
 * alone, the machinery's and the hull's joins as their masks say; its crew walk four-way routes through
 * the ship's doors, never the straight line through its walls; the alarm sounds by a click, both crew
 * go to the airlock and the HUD's lines on the hatch turn; and again from a new game by Tab and Enter.
 * Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { fourWay, openDeck, startDeck, tilemap, walkers } from './deckHelpers.ts';
import { expectFits, game } from './hutScreens.ts';
import { coloursIn, PALETTE, stage2d } from './keepHelpers.ts';

test.use({ viewport: { width: 1280, height: 800 } });

const QUIET = 'All quiet aboard.';
const SOUNDING = 'The alarm is sounding.';

test('the deck drawn by its tiles, its crew routed round its walls, and the alarm by a click and by keys', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  const box = await openDeck(page);

  await test.step('drawn at the scale rule’s whole scale, only the palette’s colours, the joins as their masks say', async () => {
    const seen = await stage2d(page);
    const [width, height] = await box.evaluate((el) => [el.clientWidth, el.clientHeight]);
    const { scale, dpr } = seen.scaled;
    expect(scale).toBe(Math.max(1, Math.floor(Math.min((width * dpr) / 208, (height * dpr) / 112))));
    const colours = await coloursIn(page, box.locator('canvas'));
    expect([...colours.keys()].filter((c) => !PALETTE.includes(c))).toEqual([]);
    const map = await tilemap(page);
    expect(map?.size).toEqual([11, 5]);
    expect(map?.tile).toEqual([16, 16]);
    const [layer] = map?.frames ?? [];
    // The engine room's machinery runs down column 1: its top joins south (4), its middle north and
    // south (5), its foot north (1); the hull at (8, 3) joins nothing; the floor never joins.
    expect([1, 2, 3, 4].map((r) => layer?.[r]?.[1])).toEqual([16 + 4, 16 + 5, 16 + 5, 16 + 1]);
    expect(layer?.[3]?.[8]).toBe(32);
    expect(layer?.[2]?.[5]).toBe(0);
    expect(layer?.[0]?.[0]).toBe(-1);
  });

  await test.step('the crew walk four-way routes through the doors, never through a wall', async () => {
    await expect
      .poll(
        async () => (await walkers(page)).find((w) => w.actor === 'ines' && w.goal === 'engines')?.route?.length ?? 0,
        {
          timeout: 60_000,
        },
      )
      .toBeGreaterThan(8);
    for (const walker of await walkers(page)) if (walker.route) expect(fourWay(walker.route), walker.actor).toBe(true);
    const route = (await walkers(page)).find((w) => w.actor === 'ines')?.route ?? [];
    expect(route[0]).toEqual([9, 1]);
    expect(route.at(-1)).toEqual([2, 1]);
  });

  await test.step('the alarm sounded by a click: both crew to the airlock, the HUD seeing the hatch', async () => {
    await expect(game(page).getByText(QUIET)).toBeVisible();
    await expect(game(page).getByText('Ines can’t see the hatch.')).toBeVisible();
    await box.getByRole('button', { name: 'Sound the alarm' }).click();
    await expect(game(page).getByText(SOUNDING)).toBeVisible();
    await expect(game(page).getByText('The alarm sounds through the deck.').first()).toBeAttached();
    await expect(game(page).getByText('Ines can see the hatch.')).toBeVisible({ timeout: 90_000 });
    await expect(game(page).getByText('Oren can see the hatch.')).toBeVisible({ timeout: 90_000 });
    for (const walker of await walkers(page)) if (walker.route) expect(fourWay(walker.route), walker.actor).toBe(true);
    await expectFits(page);
  });

  await test.step('and from a new game by the keyboard alone: Tab to it, Enter', async () => {
    await page.locator('[data-panel="play"]').getByRole('button', { name: 'Start again' }).click();
    await startDeck(page);
    await expect(game(page).getByText(QUIET)).toBeVisible();
    await box.focus();
    const alarm = box.getByRole('button', { name: 'Sound the alarm' });
    for (let i = 0; i < 6 && !(await alarm.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press('Tab');
    await expect(alarm).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(game(page).getByText(SOUNDING)).toBeVisible();
  });

  expect(errors).toEqual([]);
});
