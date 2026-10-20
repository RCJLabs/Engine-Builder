/**
 * M4.5's gate (D55), on desktop: the hut's journal and the hut's own screen, set aside, made again
 * from blank screens in the designer alone, typing no JSON (designerScreens.ts). Each file comes out
 * as the fixture's JSON, key for key; every device frame draws them with nothing past its edges;
 * and the hut plays on them, the frame following the Play panel's game.
 */
import { expect, test } from '@playwright/test';
import { expectNothingOffscreen, watchErrors } from './checks.ts';
import { fixtureScreen, importDesignerHut, storedScreen } from './designerHelpers.ts';
import { expectFrameFits, makeHut, makeJournal } from './designerScreens.ts';
import { game, newGame, press, showPlay, topScreen } from './hutScreens.ts';

test.use({ viewport: { width: 1280, height: 900 }, actionTimeout: 20_000 });

test('the journal and the hut made again in the designer alone, as the fixture’s JSON', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await importDesignerHut(page);
  await makeJournal(page);
  await expect.poll(() => storedScreen(page, 'journal')).toBe(fixtureScreen('journal'));
  const hut = await makeHut(page);
  await expect.poll(() => storedScreen(page, 'hut')).toBe(fixtureScreen('hut'));

  await test.step('every device frame draws the hut with nothing past its edges, as the game is now', async () => {
    const frame = hut.getByTestId('designer-frame');
    // The designer's own game, at its start, read from the game: no step taken yet, nothing sampled.
    await expect(hut.getByText('The game’s start, seed 1.', { exact: false })).toBeVisible();
    await expect(frame.getByText('Day 0 of 10')).toBeVisible();
    await expect(frame.getByText('30 coins')).toBeVisible();
    for (const device of ['Phone, 360 × 740', 'Phone, 390 × 844', 'Tablet, 820 × 1180', 'Desktop, 1280 × 800']) {
      for (const turned of [false, true]) {
        await hut.getByLabel('Device').selectOption({ label: device });
        const turn = hut.getByRole('button', { name: 'Turn' });
        if ((await turn.getAttribute('aria-pressed')) !== String(turned)) await turn.click();
        await expectFrameFits(hut);
      }
    }
    await expectNothingOffscreen(page);
  });

  await test.step('the hut plays on them, and the frame follows the Play panel’s game', async () => {
    const panel = await showPlay(page);
    await panel.getByRole('button', { name: 'Play', exact: true }).click();
    await newGame(page);
    await press(page, topScreen(page).getByRole('button', { name: 'Rest a day' }));
    await expect(topScreen(page).getByText('Day 1 of 10')).toBeVisible();
    // Opening the journal takes no step: a click, not a press that waits for the turn.
    await topScreen(page).getByRole('button', { name: 'Journal' }).click();
    const journal = game(page).getByRole('dialog', { name: 'Journal' });
    await expect(journal.getByRole('tab')).toHaveText(['Quests', 'Bag', 'Log']);
    await journal.getByRole('button', { name: 'Close the journal' }).click();
    // The designer's frame, opened again from the Play panel's list, draws the moment the game is at.
    await panel.getByRole('button', { name: /^hut/ }).click();
    await expect(hut.getByText('As the Play panel left the game, after 1 step.')).toBeVisible();
    await expect(hut.getByTestId('designer-frame').getByText('Day 1 of 10')).toBeVisible();
  });
  expect(errors).toEqual([]);
});
