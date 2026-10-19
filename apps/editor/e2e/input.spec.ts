/**
 * M4.2's gate (D52), on desktop: the hut opened at /play/ and played to its end by keyboard alone,
 * then by a gamepad alone. Focus moves by direction from button to button, comes back to the button
 * that opened a screen once it closes, and the tabs change from keys and from the pad's shoulders.
 * What each step says is toasted, logged and held by the announcer, as the hut's feedback words it.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { expectFits, game, nextPress, topScreen } from './hutScreens.ts';
import { announcer, type Direction, fakePad, focusBy, openHut, PAD, padPress, stepWith } from './inputHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 }, actionTimeout: 20_000 });

interface Player {
  move(direction: Direction): Promise<void>;
  press(): Promise<void>;
  back(): Promise<void>;
  /** The next tab, from the tab that holds focus. */
  nextTab(): Promise<void>;
}

const keys = (page: Page): Player => ({
  move: (d) => page.keyboard.press(`Arrow${d[0]?.toUpperCase()}${d.slice(1)}`),
  press: () => page.keyboard.press('Enter'),
  back: () => page.keyboard.press('Escape'),
  nextTab: () => page.keyboard.press('ArrowRight'),
});

const pad = (page: Page): Player => ({
  move: (d) => padPress(page, PAD[d]),
  press: () => padPress(page, PAD.a),
  back: () => padPress(page, PAD.b),
  nextTab: () => padPress(page, PAD.rb),
});

/** Focus to a button by directions, then pressed, and the step it asks for waited on. */
async function take(page: Page, player: Player, button: Locator): Promise<void> {
  await focusBy(page, button, player.move);
  await stepWith(page, player.press);
}

/** The store, the journal and its log, then the season to its end: every press by `player`. */
async function playHut(page: Page, player: Player): Promise<void> {
  const top = topScreen(page);
  await test.step('rope bought in the store: toasted, logged and announced', async () => {
    const open = top.getByRole('button', { name: 'Open the store' });
    await take(page, player, open);
    const store = game(page).getByRole('dialog', { name: 'The store' });
    await take(page, player, store.getByRole('button', { name: /^Rope: \d+ coins, 2 left$/ }));
    await expect(announcer(page)).toHaveText(/^Coins: -\d+ Rope ×1 into the bag$/);
    await expect(game(page).locator('.eb-toast')).toHaveText('Rope ×1 into the bag');
    await expectFits(page);
    await take(page, player, store.getByRole('button', { name: 'Leave the store' }));
    await expect(store).toHaveCount(0);
    // Back on the hut, focus is where it was when the store opened.
    await expect(open).toBeFocused();
  });

  await test.step('the journal: its log by tab, and Back closes it', async () => {
    const journalButton = top.getByRole('button', { name: 'Journal' });
    await focusBy(page, journalButton, player.move);
    await player.press();
    const journal = game(page).getByRole('dialog', { name: 'Journal' });
    await expect(journal).toBeVisible();
    await focusBy(page, journal.getByRole('tab', { name: 'Quests' }), player.move);
    await player.nextTab();
    await player.nextTab();
    await expect(journal.getByRole('tab', { name: 'Log' })).toHaveAttribute('aria-selected', 'true');
    const log = journal.getByRole('log', { name: 'The season so far' });
    await expect(log.getByRole('listitem')).toHaveText(['Rope ×1 into the bag', /^Coins: -\d+$/]);
    await expectFits(page);
    await player.back();
    await expect(journal).toHaveCount(0);
    await expect(journalButton).toBeFocused();
  });

  await test.step('the season played to its end', async () => {
    for (let turn = 0; turn < 80; turn++) {
      const next = await nextPress(page);
      if (!next) break;
      await take(page, player, next.button);
    }
    await expect(topScreen(page).getByText('The hut is closed for the winter.')).toBeVisible();
    await expect(announcer(page)).toHaveText(/The hut is shut for the winter\.$/);
    await expectFits(page);
  });
}

test('the hut played to its end at /play/ by keyboard alone', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await openHut(page, async (button) => {
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
  });
  // Tab goes from the page's own button into the game, as on any page; arrows take over there.
  await page.keyboard.press('Tab');
  await expect(game(page).locator(':focus')).toHaveCount(1);
  // Nothing has been said yet, and the hut's own log says so.
  await expect(topScreen(page).getByRole('log', { name: 'Lately' })).toHaveText('Nothing has happened yet.');
  await expectFits(page);
  await playHut(page, keys(page));
  expect(errors).toEqual([]);
});

test('the hut played to its end at /play/ by a gamepad alone, its focus rings drawn', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await fakePad(page);
  await openHut(page, (button) => button.click());
  await padPress(page, PAD.down);
  await expect(game(page)).toHaveAttribute('data-input', 'pad');
  // The pad's focus ring is the theme's accent, 3 px, on whatever has focus.
  const focused = game(page).locator('button:focus');
  await expect(focused).toHaveCount(1);
  await expect(focused).toHaveCSS('outline-width', '3px');
  await playHut(page, pad(page));
  // A key clears the pad's mark.
  await page.keyboard.press('Shift');
  await expect(game(page)).not.toHaveAttribute('data-input', 'pad');
  expect(errors).toEqual([]);
});
