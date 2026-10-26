/**
 * M6.7's gate by keys and the mouse (D79, docs/specs/radiant.md#the-gate): the hollows played in the
 * Play panel. Supplies read from the board finds the nearest cave with a cache: the barrow, a door
 * away, the compass through its door and the journal naming it; the crate taken there. Read again,
 * the barrow was the last run's, so the mine, two doors away through the hall, its chest found
 * through a prefab. Read a third time, both caches taken and nothing comes back: no run.
 */
import { expect, type Locator, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { holdUntilIn, offered } from './glenHelpers.ts';
import { lastUse, marksAt, openHollows } from './hollowsHelpers.ts';
import { game } from './hutScreens.ts';
import { entry, openScreen } from './markerHelpers.ts';
import { drawing, faceTowards, holdUntilPast, settled } from './walkHelpers.ts';

const click = (button: Locator) => button.click();

test('the hollows by keys: Supplies to the nearest cave with a cache, then the next, then none', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = watchErrors(page);
  const green = await openHollows(page);
  await green.focus();
  await settled(page);

  await test.step('the board read: the barrow’s crate, the compass through the barrow’s door', async () => {
    await offered(page, 'board');
    await page.keyboard.press('KeyE');
    await marksAt(page, [['cache', 'barrow-door']]);
    const journal = await openScreen(page, 'Journal', click);
    await expect(entry(journal, 'Supplies')).toContainText('The board asks for the supplies left in The barrow.');
    await expect(entry(journal, 'Supplies')).toContainText('Take the supplies from the Crate in The barrow');
    await click(journal.getByRole('button', { name: 'Close' }));
  });

  await test.step('into the barrow by its door, the crate taken', async () => {
    await green.focus();
    await faceTowards(page, green, -6, 1.1);
    await holdUntilPast(page, ['KeyW'], 'z', { atMost: 2.4 });
    await offered(page, 'barrow-door');
    await page.keyboard.press('KeyE');
    const barrow = await drawing(page, 'barrow', 'The barrow');
    await barrow.focus();
    await marksAt(page, [['cache', null]]);
    await offered(page, 'cache');
    await page.keyboard.press('KeyE');
    await marksAt(page, []);
    await expect(game(page).getByText('Supplies 1')).toBeVisible();
  });

  await test.step('out, and the board read again: the mine, through the hall', async () => {
    await holdUntilIn(page, ['KeyS'], 'green');
    const back = await drawing(page, 'green', 'The green');
    await back.focus();
    await offered(page, 'board');
    await page.keyboard.press('KeyE');
    await marksAt(page, [['cache', 'hall-door']]);
  });

  await test.step('through the hall to the mine, its chest taken', async () => {
    const here = page.locator('[data-eb-walk]');
    await faceTowards(page, here, 6, 1.1);
    await holdUntilPast(page, ['KeyW'], 'z', { atMost: 2.4 });
    await offered(page, 'hall-door');
    await page.keyboard.press('KeyE');
    await drawing(page, 'hall', 'The hall');
    await marksAt(page, [['cache', 'mine-door']]);
    await offered(page, 'mine-door');
    await page.keyboard.press('KeyE');
    const mine = await drawing(page, 'mine', 'The mine');
    await mine.focus();
    await marksAt(page, [['cache', null]]);
    await offered(page, 'stash/chest');
    await page.keyboard.press('KeyE');
    await marksAt(page, []);
    await expect(game(page).getByText('Supplies 2')).toBeVisible();
  });

  await test.step('back on the green, the board has no third run', async () => {
    await holdUntilIn(page, ['KeyS'], 'green');
    const back = await drawing(page, 'green', 'The green');
    await back.focus();
    await offered(page, 'board');
    await page.keyboard.press('KeyE');
    await expect.poll(() => lastUse(page, 'board')).toBe('refused');
    await marksAt(page, []);
  });
  expect(errors).toEqual([]);
});
