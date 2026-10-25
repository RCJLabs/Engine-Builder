/**
 * M6.3's gate on desktop (D75, docs/specs/ai.md#the-gate): the village played in the Play panel by
 * keys and the mouse. The clock runs on the HUD as the village is walked; a walk up behind the guard
 * goes unnoticed; a run there makes them suspicious, and turned to the player they see them, grow
 * alerted and halt them with a talk; and Wait jumps the clock to the evening, the smith walking home
 * to the cottage. Read through the HUD and window.__ebWalk. The clock's 20x and the senses' numbers
 * are first guesses, untested for feel.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { game, topScreen } from './hutScreens.ts';
import { agentOf, heard, nav } from './squareHelpers.ts';
import { clockOf, doingOf, GUARD_AT, HALT, LEAVING, openVillage, senses } from './villageHelpers.ts';
import { faceTowards, holdFor, holdUntilPast, settled } from './walkHelpers.ts';

test('the village by keys and the mouse: the clock, the guard’s watch and the smith’s evening', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  const village = await openVillage(page);
  await village.focus();
  await settled(page);

  await test.step('the clock runs on the HUD while the village is walked', async () => {
    // A game minute every three real seconds at 20x.
    await expect.poll(() => clockOf(page), { timeout: 15_000 }).toMatch(/^10:0[1-9]$/);
    expect(await doingOf(page)).toBe('Ada: work · Bram: work, unaware');
  });

  await test.step('a walk up behind the guard goes unnoticed', async () => {
    await faceTowards(page, village, GUARD_AT[0], GUARD_AT[2]);
    await holdUntilPast(page, ['KeyW'], 'z', { atMost: -11.5 });
    await settled(page);
    // Two reports in, the guard has neither seen nor heard the player behind them.
    const before = (await senses(page)).sent.length;
    await expect.poll(async () => (await senses(page)).sent.length, { timeout: 5000 }).toBeGreaterThan(before + 1);
    expect((await senses(page)).sent.slice(before).every((s) => Object.keys(s.npcs).length === 0)).toBe(true);
    expect(await doingOf(page)).toBe('Ada: work · Bram: work, unaware');
  });

  await test.step('a run there makes them suspicious; turned, they see the player and halt them', async () => {
    let suspicious = false;
    const watching = (async () => {
      for (let i = 0; i < 200 && !suspicious; i++) {
        if ((await doingOf(page).catch(() => '')).endsWith('face, suspicious')) suspicious = true;
        else await page.waitForTimeout(50);
      }
    })();
    for (let i = 0; i < 4; i++) await holdFor(page, ['ShiftLeft', i % 2 === 0 ? 'KeyA' : 'KeyD'], 500);
    await expect(topScreen(page).getByText(HALT)).toBeVisible({ timeout: 15_000 });
    await watching;
    expect(suspicious, 'the HUD said the guard was suspicious before the halt').toBe(true);
    const sent = (await senses(page)).sent.filter((s) => s.sent === 'accepted');
    expect(sent.some((s) => (s.npcs.guard?.heard ?? 0) > 0)).toBe(true);
    expect(sent.some((s) => (s.npcs.guard?.seen?.length ?? 0) > 0)).toBe(true);
    await topScreen(page).getByRole('button', { name: LEAVING }).click();
    await expect(topScreen(page).getByText(HALT)).toBeHidden();
  });

  await test.step('Wait jumps the clock to the evening, and the smith walks home', async () => {
    await game(page).getByRole('button', { name: 'Wait 12 hours' }).click();
    await expect.poll(() => clockOf(page)).toMatch(/^22:/);
    await expect.poll(async () => agentOf(await nav(page), 'smith')?.goal).toBe('cottage-door');
    await expect.poll(async () => heard(await nav(page)).has('smith cottage-door'), { timeout: 60_000 }).toBe(true);
    await expect.poll(() => doingOf(page)).toMatch(/^Ada: sleep · /);
  });
  expect(errors).toEqual([]);
});
