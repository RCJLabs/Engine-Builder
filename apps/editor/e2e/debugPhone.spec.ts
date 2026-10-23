/**
 * M4.9's gate on phones (D59), upright at 360 and 390 px and held sideways: the hut in the Play
 * panel behind More, its debug tools worked by touch under the game. Two loads carried and read
 * in the log, a step back and forward, a day waited and the storm it brings, the loads quest's why
 * and its stage set, an effect run from the form, a state kept and restored, and Replay on the
 * project unchanged; each section in reach with no target under 44 px and nothing axe finds.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { debugRegion, debugSaid, logLines, openPart, tap } from './debugHelpers.ts';
import { addEffect, choose } from './hutHelpers.ts';
import { expectFits, game, press, startHut, topScreen } from './hutScreens.ts';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the debug tools, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('the hut read, moved, kept and replayed by touch, every section in reach', async ({ page }) => {
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      await startHut(page);
      const debug = debugRegion(page);
      for (let i = 0; i < 2; i++) {
        const carry = topScreen(page).getByRole('button', { name: 'Carry a load up' });
        await carry.scrollIntoViewIfNeeded();
        await press(page, carry, true);
      }

      const steps = await openPart(page, 'Steps', tap);
      await expect.poll(() => logLines(page)).toEqual(['1 Carry', '2 Carry']);
      await debug.getByRole('button', { name: 'Step back' }).tap();
      await expect(steps.getByText('Step 1 of 2')).toBeVisible();
      await debug.getByRole('button', { name: 'Step forward' }).tap();
      await expect(steps.getByText('Step 2 of 2')).toBeVisible();
      await expectFits(page);

      const named = await openPart(page, 'Named states', tap);
      await named.getByLabel('Name').fill('Day two');
      await named.getByRole('button', { name: 'Keep this state' }).tap();
      await expect(debugSaid(page)).toHaveText('Kept as day-two.');

      const time = await openPart(page, 'Time', tap);
      await time.getByRole('button', { name: '+1 day' }).tap();
      await expect(game(page).getByRole('dialog')).toBeVisible();
      await expect(time.getByText(/^day\s*3$/)).toBeVisible();
      await expectFits(page);

      const quests = await openPart(page, 'Quests', tap);
      const loads = quests.getByRole('listitem').filter({ hasText: 'Loads for the village' }).first();
      await expect(loads).toContainText('Carry five loads up: 2 of 5');
      await loads.getByLabel('Loads for the village’s stage').selectOption('thanked');
      await loads.getByRole('button', { name: 'Set stage' }).tap();
      await expect(loads).toContainText('Loads for the village · done at thanked');
      await expectFits(page);

      const run = await openPart(page, 'Run an effect', tap);
      const coins = await addEffect(run, 'Effects to run', 'Add to a resource');
      await choose(coins, /^Resource/, 'Choose a resource', 'Coins (coins)');
      await coins.getByLabel(/^By/).fill('5');
      await run.getByRole('button', { name: 'Run as a debug step' }).tap();
      await expect(debugSaid(page)).toHaveText('Ran add-resource resource=coins by=5.');
      await expectFits(page);

      await openPart(page, 'Named states', tap);
      await debug.getByRole('button', { name: 'Restore day-two' }).tap();
      await expect(debugSaid(page)).toHaveText('Restored day-two.');
      await expect(game(page).getByRole('dialog')).toHaveCount(0);

      // The project as it was: every step plays out the same. The state was kept after a step back,
      // whose save starts where the game stood then, so its run holds the one step taken after it.
      const replay = await openPart(page, 'Replay', tap);
      await replay.getByRole('button', { name: 'Replay on the project now' }).tap();
      await expect(replay.locator('.debug-report')).toHaveText('The one step plays out the same.');
      await expectFits(page);
      expect(errors).toEqual([]);
    });
  });
}
