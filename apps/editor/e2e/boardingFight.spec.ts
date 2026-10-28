/**
 * M7.5's demo by mouse and keys (D87, docs/specs/tactics.md#a-stage-in-code): the boarding deck drawn by
 * Space-Wrecked's battle board, at 1280 wide in the Play panel. The alarm sends Ines and Oren to their posts and
 * the boarders come; the bar is the page's, the board drawn above it by the stage; a move is previewed by a click
 * on the board and sent by a second, the stage telling back the tile; the arrows move the cursor and Enter sends,
 * while Shift and the arrows still turn the board; and from a new game the kit AI's winning line is played through
 * the bar and the board to the boarders beaten. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { boardingLine, pressBoard, toBoarders } from './boardingFightHelpers.ts';
import { code, openBoarding, startBoarding } from './boardingHelpers.ts';
import { watchErrors } from './checks.ts';
import { barButton, battle, boardOf, crewTurn, playAction } from './fightHelpers.ts';
import { expectFits, game } from './hutScreens.ts';

test.use({ viewport: { width: 1280, height: 800 } });

test('the boarders fought on the battle board by mouse and keys, to the end', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = watchErrors(page);
  const box = await openBoarding(page);

  await test.step('the alarm sends the crew to their posts and the boarders come: the bar, the board above it', async () => {
    await toBoarders(page);
    const seen = await crewTurn(page);
    expect(seen.view?.units.map((u) => u.id)).toEqual(['c1', 'c2', 'e1', 'e2', 'e3']);
    expect(seen.selected).toBe('c1');
    await expect(game(page).getByText('Round 1', { exact: true })).toBeVisible();
    await expect(box.getByRole('button', { name: 'Sound the alarm' })).toHaveCount(0);
    for (const b of seen.bar) expect(Math.min(b.box.width, b.box.height), b.key).toBeGreaterThanOrEqual(44);
    // The stage draws on, and keeps its board above the bar's room.
    const bar = await page.locator('.eb-battle-bar').boundingBox();
    expect((seen as { inset?: number }).inset).toBeGreaterThanOrEqual(Math.floor(bar?.height ?? 0));
    const frames = (await code(page))?.frames ?? 0;
    await expect.poll(async () => (await code(page))?.frames).toBeGreaterThan(frames);
    expect((await code(page))?.error).toBeUndefined();
    await expectFits(page);
  });

  await test.step('a move previewed by a click on the board and sent by a second, the stage telling the tile', async () => {
    const seen = await crewTurn(page);
    const step = seen.view?.choices.find((c) => c.unit === 'c1')?.moves.find((m) => m.ap === 1);
    if (!step) throw new Error('Ines can reach nowhere');
    await pressBoard(page, step.to);
    await expect
      .poll(async () => (await battle(page))?.preview)
      .toEqual({ type: 'tactics/move', unit: 'c1', to: step.to });
    await pressBoard(page, step.to);
    // A tap reaches the battle only once the stage's next frame tells its tile, so the move is waited for.
    await expect
      .poll(async () => (await battle(page))?.sent.at(-1))
      .toEqual({ action: { type: 'tactics/move', unit: 'c1', to: step.to }, sent: 'accepted' });
    await crewTurn(page);
  });

  await test.step('the arrows move the cursor and Enter sends; Shift and the arrows turn the board instead', async () => {
    const seen = await crewTurn(page);
    const mover = seen.view?.choices.find((c) => c.moves.length > 0);
    const step = mover?.moves[0];
    if (!mover || !step) throw new Error('No one can move');
    await barButton(page, `unit:${mover.unit}`).click();
    await page.locator('.eb-stage-canvas').focus();
    const from =
      (await battle(page))?.cursor ?? (seen.view?.units.find((u) => u.id === mover.unit)?.at as [number, number]);
    const [dx, dy] = [step.to[0] - from[0], step.to[1] - from[1]];
    for (let i = 0; i < Math.abs(dx); i++) await page.keyboard.press(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
    for (let i = 0; i < Math.abs(dy); i++) await page.keyboard.press(dy > 0 ? 'ArrowDown' : 'ArrowUp');
    await expect.poll(async () => (await battle(page))?.cursor).toEqual(step.to);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await crewTurn(page)).view?.units.find((u) => u.id === mover.unit)?.at)
      .toEqual(step.to);
    // With Shift held the arrows are the stage's: the cursor stays and the board turns under it.
    const cursor = (await battle(page))?.cursor;
    const before = await page.locator('.eb-stage-canvas').screenshot();
    await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(async () => (await page.locator('.eb-stage-canvas').screenshot()).equals(before)).toBe(false);
    expect((await battle(page))?.cursor).toEqual(cursor);
  });

  await test.step('won from a new game: the kit AI’s winning line played through the bar and the board', async () => {
    const line = await boardingLine();
    await page.getByLabel('Seed').fill(line.seed);
    await page.getByRole('button', { name: 'Start again' }).click();
    await startBoarding(page);
    await toBoarders(page);
    for (const [i, action] of line.actions.entries()) {
      await playAction(page, action, false, pressBoard);
      const seen = await battle(page);
      if (seen?.view) expect(boardOf(seen.view.units), `after ${i}: ${JSON.stringify(action)}`).toBe(line.boards[i]);
    }
    await expect(game(page).getByText('The boarders are beaten.')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.eb-battle-bar')).toBeHidden();
  });

  expect(errors).toEqual([]);
});
