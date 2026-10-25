/**
 * M6.3's gate by touch (D75, docs/specs/ai.md#the-gate), at 360×740 and 390×844 upright and 844×390
 * sideways: the village played in the Play panel with the floating stick. The clock runs on the HUD;
 * the stick pulled back walks the player up behind the guard unnoticed; pushed past its run, side to
 * side, it makes the guard suspicious, and turned to the player they halt them with a talk; and Wait,
 * tapped, jumps the clock to the evening, the smith walking home. Every target 44 px, nothing off the
 * screen. Untested for feel.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { expectFits, game, topScreen } from './hutScreens.ts';
import { heard, nav } from './squareHelpers.ts';
import { clockOf, doingOf, HALT, LEAVING, openVillage, senses } from './villageHelpers.ts';
import { finger, settled, stickUntil, walked } from './walkHelpers.ts';

/** The stick pushed sideways past its run (STICK_SIZE / 2 × RUN_PAST is 48 px) for `ms`. */
async function runSideways(page: Page, box: Locator, px: number, ms: number): Promise<void> {
  await box.scrollIntoViewIfNeeded();
  const area = await box.boundingBox();
  if (!area) throw new Error('No view to run on');
  const thumb = await finger(page, 1);
  await thumb.down(area.x + area.width * 0.25, area.y + area.height * 0.6);
  await thumb.move(px, 0);
  await page.waitForTimeout(ms);
  await thumb.up();
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the village by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('the clock, the guard’s watch by the stick, and Wait tapped to the evening', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      const village = await openVillage(page, true);
      await settled(page);

      await test.step('the clock runs on the HUD', async () => {
        await expect.poll(() => clockOf(page), { timeout: 15_000 }).toMatch(/^10:0[1-9]$/);
        await expectFits(page);
      });

      await test.step('the stick pulled back walks the player up behind the guard, unnoticed', async () => {
        // The player starts facing into the village, the guard behind them at the gate.
        await stickUntil(page, village, -30, (w) => w.feet[2] <= -11.5);
        await settled(page);
        expect((await walked(page)).feet[2]).toBeGreaterThan(-13);
        const before = (await senses(page)).sent.length;
        await expect.poll(async () => (await senses(page)).sent.length, { timeout: 5000 }).toBeGreaterThan(before + 1);
        expect((await senses(page)).sent.slice(before).every((s) => Object.keys(s.npcs).length === 0)).toBe(true);
        expect(await doingOf(page)).toMatch(/Bram: work, unaware$/);
      });

      await test.step('run side to side there: suspicious, then halted', async () => {
        for (let i = 0; i < 4; i++) await runSideways(page, village, i % 2 === 0 ? -54 : 54, 500);
        await expect(topScreen(page).getByText(HALT)).toBeVisible({ timeout: 15_000 });
        const sent = (await senses(page)).sent.filter((s) => s.sent === 'accepted');
        expect(sent.some((s) => (s.npcs.guard?.heard ?? 0) > 0)).toBe(true);
        await expectFits(page);
        await topScreen(page).getByRole('button', { name: LEAVING }).tap();
        await expect(topScreen(page).getByText(HALT)).toBeHidden();
      });

      await test.step('Wait tapped: the evening, and the smith walks home', async () => {
        await game(page).getByRole('button', { name: 'Wait 12 hours' }).tap();
        await expect.poll(() => clockOf(page)).toMatch(/^22:/);
        await expect.poll(async () => heard(await nav(page)).has('smith cottage-door'), { timeout: 60_000 }).toBe(true);
        await expectFits(page);
      });
      expect(errors).toEqual([]);
    });
  });
}
