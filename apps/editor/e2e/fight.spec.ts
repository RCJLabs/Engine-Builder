/**
 * M7.5's gate by mouse and keys (D87, docs/specs/tactics.md#the-gate): the boarding fight played in the Play
 * panel at 1280 wide, through window.__ebStage2d.battle(). The alarm starts the battle; a move is previewed by a
 * click and sent by a second; a shot's odds in the bar are the HUD's tactics.hit, the sim's own; overwatch is set;
 * the foes' turn plays back from its beats before a click is taken again; the arrows move the cursor, Enter
 * previews and confirms, Escape takes it back; and the fight goes on to its end. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import {
  barButton,
  battle,
  boardOf,
  crewTurn,
  openFight,
  playAction,
  pressTile,
  startFight,
  winningLine,
} from './fightHelpers.ts';
import { expectFits, game } from './hutScreens.ts';

test.use({ viewport: { width: 1280, height: 800 } });

test('the boarding fight by mouse and keys: a move, a shot at the odds shown, overwatch, the foes’ turn, the end', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors = watchErrors(page);
  const box = await openFight(page);

  await test.step('the alarm starts the battle: the bar, Ines selected, the uses gone', async () => {
    await page.getByRole('button', { name: 'Sound the alarm' }).click();
    const seen = await crewTurn(page);
    expect(seen.view?.units.map((u) => u.id)).toEqual(['c1', 'c2', 'c3', 'e1', 'e2', 'e3']);
    expect(seen.selected).toBe('c1');
    await expect(game(page).getByText('Round 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sound the alarm' })).toHaveCount(0);
    for (const b of seen.bar) {
      expect(b.box.height, b.key).toBeGreaterThanOrEqual(44);
      expect(b.box.width, b.key).toBeGreaterThanOrEqual(44);
    }
    await expectFits(page);
  });

  await test.step('a move previewed by a click and sent by a second', async () => {
    const seen = await crewTurn(page);
    const step = seen.view?.choices.find((c) => c.unit === 'c1')?.moves.find((m) => m.ap === 1);
    if (!step) throw new Error('Ines can reach nowhere');
    await pressTile(page, step.to);
    await expect
      .poll(async () => (await battle(page))?.preview)
      .toEqual({ type: 'tactics/move', unit: 'c1', to: step.to });
    await expect(page.getByRole('status').filter({ hasText: 'Ines moves to' })).toBeVisible();
    await pressTile(page, step.to);
    const after = await crewTurn(page);
    expect(after.sent.at(-1)).toEqual({ action: { type: 'tactics/move', unit: 'c1', to: step.to }, sent: 'accepted' });
    expect(after.view?.units.find((u) => u.id === 'c1')?.at).toEqual(step.to);
  });

  await test.step('the foes’ turn plays back from its beats, then the crew’s again', async () => {
    const before = await crewTurn(page);
    await barButton(page, 'end').click();
    await expect.poll(async () => (await battle(page))?.preview).toEqual({ type: 'tactics/end' });
    await barButton(page, 'confirm').click();
    await expect.poll(async () => (await battle(page))?.playing, { timeout: 10_000 }).toBe(true);
    const after = await crewTurn(page);
    expect(after.played).toBeGreaterThan(before.played);
    expect(after.view?.round).toBe(2);
    const moved = after.view?.units.filter(
      (u) => u.side === 'foes' && u.at.join() !== before.view?.units.find((b) => b.id === u.id)?.at.join(),
    );
    expect(moved?.length).toBeGreaterThan(0);
  });

  await test.step('a shot whose odds in the bar are the HUD’s tactics.hit, sent by Confirm', async () => {
    let seen = await crewTurn(page);
    for (
      let i = 0;
      i < 4 && !seen.view?.choices.find((c) => c.unit === 'c1')?.shots.some((s) => s.target === 'e1');
      i++
    ) {
      await barButton(page, 'end').click();
      await barButton(page, 'confirm').click();
      seen = await crewTurn(page);
    }
    const shot = seen.view?.choices.find((c) => c.unit === 'c1')?.shots.find((s) => s.target === 'e1');
    if (!shot) throw new Error('Ines never saw the first pirate');
    await barButton(page, 'unit:c1').click();
    const target = barButton(page, 'shoot:e1');
    await expect(target).toHaveText(`Pirate 1: ${shot.hit}% to hit, ${shot.crit}% to crit`);
    await expect(game(page).getByText(`Ines on the first pirate: ${shot.hit}% to hit`)).toBeVisible();
    await target.click();
    await expect
      .poll(async () => (await battle(page))?.preview)
      .toEqual({ type: 'tactics/shoot', unit: 'c1', target: 'e1' });
    await expect(target).toHaveAttribute('aria-pressed', 'true');
    await barButton(page, 'confirm').click();
    await expect.poll(async () => (await battle(page))?.sent.at(-1)?.sent).toBe('accepted');
    await expect(page.getByRole('status').filter({ hasText: /Ines c1 shoots|Ines shoots/ })).toBeVisible();
  });

  await test.step('overwatch set from the bar', async () => {
    const seen = await crewTurn(page);
    const watcher = seen.view?.choices.find((c) => c.watch)?.unit;
    if (!watcher) throw new Error('No one can watch');
    await barButton(page, `unit:${watcher}`).click();
    await barButton(page, 'watch').click();
    await barButton(page, 'watch').click();
    await expect.poll(async () => (await crewTurn(page)).view?.units.find((u) => u.id === watcher)?.watch).toBe(true);
  });

  await test.step('the arrows move the cursor, Enter previews and confirms, Escape takes it back', async () => {
    let seen = await crewTurn(page);
    if (seen.view?.choices.length === 0) {
      await barButton(page, 'end').click();
      await barButton(page, 'confirm').click();
      seen = await crewTurn(page);
    }
    const mover = seen.view?.choices.find((c) => c.moves.length > 0);
    if (!mover) throw new Error('No one can move');
    await barButton(page, `unit:${mover.unit}`).click();
    const step = mover.moves[0];
    if (!step) throw new Error('Nowhere to go');
    await box.focus();
    // The cursor from where it is, or from the unit, to the tile: across, then down or up.
    const now = await battle(page);
    const from = now?.cursor ?? (seen.view?.units.find((u) => u.id === mover.unit)?.at as readonly [number, number]);
    const [dx, dy] = [step.to[0] - from[0], step.to[1] - from[1]];
    for (let i = 0; i < Math.abs(dx); i++) await page.keyboard.press(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
    for (let i = 0; i < Math.abs(dy); i++) await page.keyboard.press(dy > 0 ? 'ArrowDown' : 'ArrowUp');
    await expect.poll(async () => (await battle(page))?.cursor).toEqual(step.to);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await battle(page))?.preview?.type).toBe('tactics/move');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await battle(page))?.preview).toBeUndefined();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await crewTurn(page)).view?.units.find((u) => u.id === mover.unit)?.at)
      .toEqual(step.to);
  });

  await test.step('won from a new game: the kit AI’s winning line played through the bar and the deck', async () => {
    const line = await winningLine();
    await page.getByLabel('Seed').fill(line.seed);
    await page.getByRole('button', { name: 'Start again' }).click();
    await startFight(page);
    await page.getByRole('button', { name: 'Sound the alarm' }).click();
    await crewTurn(page);
    for (const [i, action] of line.actions.entries()) {
      await playAction(page, action);
      const seen = await battle(page);
      if (seen?.view) expect(boardOf(seen.view.units), `after ${i}: ${JSON.stringify(action)}`).toBe(line.boards[i]);
    }
    await expect(game(page).getByText('The boarders are beaten.')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.eb-battle-bar')).toBeHidden();
  });

  expect(errors).toEqual([]);
});
