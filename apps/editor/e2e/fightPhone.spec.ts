/**
 * M7.5's gate by touch (D87, docs/specs/tactics.md#the-gate), at 360×740 and 390×844 upright and 844×390
 * sideways, each at a phone's pixel ratio: the boarding fight played in the Play panel. The alarm by a tap; the
 * bar's buttons 44 px at least and every screen fitting; a move by two taps on the deck; and from a new game the
 * kit AI's winning line played by taps on the bar and the deck, each shot's odds in the bar the sim's, to the
 * boarders beaten. And the boarding deck's battle board by touch: a move by two taps on the board, the stage
 * telling back the tile. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { pressBoard, toBoarders } from './boardingFightHelpers.ts';
import { openBoarding } from './boardingHelpers.ts';
import { watchErrors } from './checks.ts';
import {
  barButton,
  battle,
  crewTurn,
  openFight,
  playAction,
  pressTile,
  startFight,
  winningLine,
} from './fightHelpers.ts';
import { expectFits, game } from './hutScreens.ts';

for (const { viewport, dpr } of [
  { viewport: { width: 360, height: 740 }, dpr: 2 },
  { viewport: { width: 390, height: 844 }, dpr: 3 },
  { viewport: { width: 844, height: 390 }, dpr: 3 },
]) {
  test.describe(`the boarding fight by touch, ${viewport.width}×${viewport.height} at ${dpr}×`, () => {
    test.use({ viewport, deviceScaleFactor: dpr, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('a move by two taps on the deck, and the AI’s winning line by taps to the end', async ({ page }) => {
      test.setTimeout(420_000);
      const errors = watchErrors(page);
      await openFight(page, true);

      await test.step('the alarm by a tap: the bar, every button 44 px, every screen fitting', async () => {
        await page.getByRole('button', { name: 'Sound the alarm' }).tap();
        const seen = await crewTurn(page);
        expect(seen.view?.units.map((u) => u.id)).toEqual(['c1', 'c2', 'c3', 'e1', 'e2', 'e3']);
        for (const b of seen.bar) expect(Math.min(b.box.width, b.box.height), b.key).toBeGreaterThanOrEqual(44);
        await expectFits(page);
      });

      await test.step('a move previewed by a tap on the deck and sent by a second', async () => {
        const seen = await crewTurn(page);
        const step = seen.view?.choices.find((c) => c.unit === 'c1')?.moves.find((m) => m.ap === 1);
        if (!step) throw new Error('Ines can reach nowhere');
        await pressTile(page, step.to, true);
        await expect
          .poll(async () => (await battle(page))?.preview)
          .toEqual({ type: 'tactics/move', unit: 'c1', to: step.to });
        await pressTile(page, step.to, true);
        expect((await crewTurn(page)).sent.at(-1)).toEqual({
          action: { type: 'tactics/move', unit: 'c1', to: step.to },
          sent: 'accepted',
        });
      });

      await test.step('won from a new game: the kit AI’s winning line by taps on the bar and the deck', async () => {
        const line = await winningLine();
        await page.getByLabel('Seed').fill(line.seed);
        await page.getByRole('button', { name: 'Start again' }).tap();
        await startFight(page, true);
        await page.getByRole('button', { name: 'Sound the alarm' }).tap();
        await crewTurn(page);
        for (const action of line.actions) await playAction(page, action, true);
        await expect(game(page).getByText('The boarders are beaten.')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('.eb-battle-bar')).toBeHidden();
        await expectFits(page);
      });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('the boarding deck’s battle board by touch, 390×844 at 3×', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    actionTimeout: 20_000,
  });

  test('the boarders come, and a move by two taps on the board', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await openBoarding(page, true);
    await toBoarders(page, 'tap');
    const seen = await crewTurn(page);
    for (const b of seen.bar) expect(Math.min(b.box.width, b.box.height), b.key).toBeGreaterThanOrEqual(44);
    const step = seen.view?.choices.find((c) => c.unit === 'c1')?.moves.find((m) => m.ap === 1);
    if (!step) throw new Error('Ines can reach nowhere');
    await pressBoard(page, step.to, true);
    await expect
      .poll(async () => (await battle(page))?.preview)
      .toEqual({ type: 'tactics/move', unit: 'c1', to: step.to });
    await pressBoard(page, step.to, true);
    expect((await crewTurn(page)).sent.at(-1)?.sent).toBe('accepted');
    await barButton(page, 'end').tap();
    await barButton(page, 'confirm').tap();
    expect((await crewTurn(page)).view?.round).toBe(2);
    await expectFits(page);
    expect(errors).toEqual([]);
  });
});
