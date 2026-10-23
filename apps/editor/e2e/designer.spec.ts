/**
 * M4.5's gate (D55), on desktop: the hut's journal and the hut's own screen, set aside, made again
 * from blank screens in the designer alone, typing no JSON (designerScreens.ts). Each file comes out
 * as the fixture's JSON, key for key; every device frame draws them with nothing past its edges;
 * and the hut plays on them, the frame following the Play panel's game.
 */
import { expect, test } from '@playwright/test';
import { expectNothingOffscreen, watchErrors } from './checks.ts';
import { fixtureScreen, importDesignerHut, outline, storedScreen } from './designerHelpers.ts';
import { expectFrameFits, makeHut, makeJournal } from './designerScreens.ts';
import { FOLDER, HUT } from './hutHelpers.ts';
import { game, newGame, press, showPlay, topScreen } from './hutScreens.ts';
import { storedText } from './kitHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 }, actionTimeout: 20_000 });

test('a widget dragged by its handle among its siblings, one step that Undo takes back', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const panel = await importDesignerHut(page, HUT);
  await panel.getByRole('button', { name: /^hut/ }).click();
  const region = page.getByRole('region', { name: 'Screen hut' });
  const row = (label: string) => outline(region).locator('li', { hasText: label });
  const grid = async () => {
    // Caught mid-write, the file reads as not there yet, and the poll asks again.
    const text = await storedScreen(page, 'hut');
    return text === '' ? [] : JSON.parse(text).main.children[2].children.map((b: { label: string }) => b.label);
  };
  // The outline sits below the frame: the rows are scrolled to before the mouse moves over them.
  const handle = row('Rest a day').locator('[data-target]');
  await handle.scrollIntoViewIfNeeded();
  const [from, to] = [await handle.boundingBox(), await row('Carry a load up').boundingBox()];
  if (!from || !to) throw new Error('No rows to drag between');
  // By the handle, to above the first button's middle: Rest a day goes first.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 4, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(grid)
    .toEqual([
      'Rest a day',
      'Carry a load up',
      'Open the store',
      'Visit Greta',
      'Visit Anselm',
      'Close the hut for the winter',
    ]);
  // A drag on the row itself is a press that selects, never a move: the order stays.
  const before = await grid();
  await row('Visit Greta').getByRole('button').first().dragTo(row('Open the store').getByRole('button').first());
  expect(await grid()).toEqual(before);
  await page.getByRole('button', { name: 'Undo: Move in hut' }).click();
  await expect.poll(() => storedScreen(page, 'hut')).toBe(fixtureScreen('hut'));
  expect(errors).toEqual([]);
});

test('the theme designed by its colours, each pair’s contrast shown as it is picked', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const panel = await importDesignerHut(page);
  await panel.getByRole('button', { name: /^Theme/ }).click();
  const theme = page.getByRole('region', { name: 'The theme' });
  await theme.getByRole('button', { name: 'Design', exact: true }).click();
  const contrast = theme.getByRole('list', { name: 'Contrast' });
  await expect(contrast.getByRole('listitem')).toHaveCount(5);
  await expect(contrast.getByText(/^text on background: [\d.]+:1, passes$/)).toBeVisible();
  await expect(theme.locator('.eb-designed').getByText('Body text, as most of a game’s words are.')).toBeVisible();
  // A muted colour too near the background: its pairs say so as it is picked, and the checks agree (E050).
  await theme.getByLabel('muted', { exact: true }).fill('#2a3038');
  await expect(contrast.getByText(/^muted on background: [\d.]+:1, below 4\.5:1$/)).toBeVisible();
  await expect(contrast.getByText(/^muted on surface: [\d.]+:1, below 4\.5:1$/)).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Problems \(\d+\)$/ })).toBeVisible();
  await expect
    .poll(async () => JSON.parse((await storedText(page, FOLDER, 'ui/theme.json')) ?? '{}').colors?.muted)
    .toBe('#2a3038');
  // The interface's sounds (M4.8), picked by name: Back gets the door.
  const sounds = theme.getByRole('group', { name: /^Interface sounds/ });
  await expect(sounds.getByRole('button', { name: /^Back .*Click/ })).toBeVisible();
  await sounds.getByRole('button', { name: /^Back / }).click();
  await page.getByRole('dialog', { name: 'Choose a sound' }).getByRole('option', { name: 'Door (door)' }).click();
  await expect
    .poll(async () => JSON.parse((await storedText(page, FOLDER, 'ui/theme.json')) ?? '{}').sounds)
    .toEqual({ press: 'click', open: 'click', back: 'door' });
  expect(errors).toEqual([]);
});

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
