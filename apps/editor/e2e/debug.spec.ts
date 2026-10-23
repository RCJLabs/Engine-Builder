/**
 * M4.9's gate (D59), on desktop: the hut in the Play panel with its debug tools. A few days played
 * and read in the log; time moved a day by the time kit's wait, which brings the storm as a played
 * day does, then taken back; the loads quest's why read and its stage set by an effect; the state
 * read slice by slice; a named state kept and restored; a debugged slot that can't be saved out;
 * then the loads quest edited by its form, and Replay stopping at the first step that differs.
 */
import { expect, test } from '@playwright/test';
import { expectNoAxeIssues, watchErrors } from './checks.ts';
import { debugRegion, debugSaid, logLines, oneLoad, openPart } from './debugHelpers.ts';
import { addEffect, choose } from './hutHelpers.ts';
import { expectFits, game, press, shellScreens, showPlay, startHut, topScreen } from './hutScreens.ts';
import { pauseDialog } from './playShellHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 }, actionTimeout: 20_000 });

test('the hut in Play, read, moved, kept and replayed with the debug tools', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await startHut(page);
  const debug = debugRegion(page);
  await expect(debug).toBeVisible();

  // Two loads carried, two days gone: the log has them, and their beats.
  for (let i = 0; i < 2; i++) await press(page, topScreen(page).getByRole('button', { name: 'Carry a load up' }));
  const steps = await openPart(page, 'Steps');
  await expect(steps.getByText('Step 2 of 2')).toBeVisible();
  await expect.poll(() => logLines(page)).toEqual(['1 Carry', '2 Carry']);
  await expect(steps.getByText('hut/carried').first()).toBeVisible();

  // Kept before the storm, to come back to.
  const named = await openPart(page, 'Named states');
  await named.getByLabel('Name').fill('Before the storm');
  await named.getByRole('button', { name: 'Keep this state' }).click();
  await expect(debugSaid(page)).toHaveText('Kept as before-the-storm.');
  await expect(named.getByText('before-the-storm · step 2')).toBeVisible();

  // A day waited: the sheet's day-3 row brings the storm, as a played day would.
  const time = await openPart(page, 'Time');
  await expect(time.getByText(/^day\s*2$/)).toBeVisible();
  await time.getByRole('button', { name: '+1 day' }).click();
  await expect(game(page).getByRole('dialog')).toBeVisible();
  await expect(time.getByText(/^day\s*3$/)).toBeVisible();
  await openPart(page, 'Steps');
  await expect.poll(() => logLines(page)).toEqual(['1 Carry', '2 Carry', '3 Debug: wait days=1 debug']);
  await expect(debug.getByText('A debug step changed this game, so it stays in the editor.')).toBeVisible();

  // The slot keeps the debugged game, and it can't be saved out.
  await page.getByRole('button', { name: 'Pause' }).click();
  await pauseDialog(page).getByRole('button', { name: 'Saves' }).click();
  const slot = shellScreens(page).getByRole('listitem').filter({ hasText: 'Slot 1' });
  await expect(slot.getByText('Changed by the debug tools, so it stays here: it can’t be saved out.')).toBeVisible();
  await expect(slot.getByRole('button', { name: 'Save file' })).toHaveCount(0);
  await expect(slot.getByRole('button', { name: 'Copy code' })).toHaveCount(0);
  await shellScreens(page).getByRole('button', { name: 'Back' }).click();
  await pauseDialog(page).getByRole('button', { name: 'Resume' }).click();

  // Taken back: the run played again to step 2, the storm never came, the step left ahead.
  await debug.getByRole('button', { name: 'Step back' }).click();
  await expect(debug.getByText('Step 2 of 3')).toBeVisible();
  await expect(game(page).getByRole('dialog')).toHaveCount(0);
  await expect(game(page).getByText('Day 2 of 10')).toBeVisible();
  await expect(debug.locator('.debug-line[data-ahead]')).toHaveText(/Debug: wait days=1/);
  await debug.getByRole('button', { name: 'Step forward' }).click();
  await expect(debug.getByText('Step 3 of 3')).toBeVisible();
  await expect(game(page).getByRole('dialog')).toBeVisible();
  await debug.getByRole('button', { name: 'Step back' }).click();
  await expect(debug.getByText('Step 2 of 3')).toBeVisible();

  // The loads quest: two of five carried, nine days to do it in; set to its end by an effect.
  const quests = await openPart(page, 'Quests');
  const loads = quests.getByRole('listitem').filter({ hasText: 'Loads for the village' }).first();
  await expect(loads).toContainText('Loads for the village · active at carry');
  await expect(loads).toContainText('Carry five loads up: 2 of 5');
  await loads.getByLabel('Loads for the village’s stage').selectOption('thanked');
  await loads.getByRole('button', { name: 'Set stage' }).click();
  await expect(debugSaid(page)).toHaveText('Loads for the village set to thanked.');
  await expect(loads).toContainText('Loads for the village · done at thanked');

  // An effect made with the effects form content uses, previewed, then run as a step.
  const run = await openPart(page, 'Run an effect');
  const coins = await addEffect(run, 'Effects to run', 'Add to a resource');
  await choose(coins, /^Resource/, 'Choose a resource', 'Coins (coins)');
  await coins.getByLabel(/^By/).fill('5');
  await run.getByRole('button', { name: 'Preview' }).click();
  await expect(run.getByRole('list', { name: 'What they would do now' })).toContainText('"effect":"add-resource"');
  await run.getByRole('button', { name: 'Run as a debug step' }).click();
  await expect(debugSaid(page)).toHaveText('Ran add-resource resource=coins by=5.');

  // The state, slice by slice: the debug slice counts the steps it took.
  const state = await openPart(page, 'State');
  const slice = state.locator('details.debug-slice').filter({ hasText: /^debug/ });
  await slice.locator('summary').click();
  await expect(slice.locator('pre')).toHaveText(/"steps": 2/);
  await expectFits(page);

  // Restored: the game is as kept, and its two steps can be stepped back through.
  await openPart(page, 'Named states');
  await debug.getByRole('button', { name: 'Restore before-the-storm' }).click();
  await expect(debugSaid(page)).toHaveText('Restored before-the-storm.');
  await openPart(page, 'Steps');
  await expect(debug.getByText('Step 2 of 2')).toBeVisible();
  await expect(game(page).getByText('Day 2 of 10')).toBeVisible();

  // An edit, and Replay: the first load now ends the quest, so step 1 plays out differently.
  await oneLoad(page);
  await showPlay(page);
  await expect(page.getByText('The project has changed since this game started')).toBeVisible();
  const replay = await openPart(page, 'Replay');
  await replay.getByRole('button', { name: 'Replay on the project now' }).click();
  // The village's thanks: ten coins on the thirty the purse starts with, kept as a change.
  await expect(replay.locator('.debug-report')).toHaveText(
    'Step 1 (Carry) plays out differently: in economy, /amounts/coins was nothing, now 40; factions and quests changed too.',
  );
  await expect(page.getByText('The project has changed since this game started')).toHaveCount(0);
  await openPart(page, 'Steps');
  await expect(debug.getByText('Step 1 of 2')).toBeVisible();
  await openPart(page, 'Quests');
  await expect(debug.getByRole('listitem').filter({ hasText: 'Loads for the village' }).first()).toContainText(
    'done at thanked',
  );
  await expectNoAxeIssues(page);
  expect(errors).toEqual([]);
});
