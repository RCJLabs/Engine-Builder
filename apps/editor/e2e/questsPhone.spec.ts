/**
 * M3.9 on phones, portrait and landscape: the quests kit ticked by touch, a quest's first stage
 * with an objective that leads to a second stage and one counted, and the second stage, filled in
 * in the inspector's sheet; then the map's box for the second stage tapped, which opens its
 * stage's form. All in reach, with nothing past the screen's edge.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { stored } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';

async function expectFits(page: Page, scope: string): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, scope)).toEqual([]);
  await expectNoAxeIssues(page);
}

/** An item tapped into a list in `scope`, once it shows. */
async function tapAdd(scope: Locator, list: string, n: number): Promise<Locator> {
  await scope.getByRole('button', { name: `Add to ${list}`, exact: true }).tap();
  const item = scope.getByRole('group', { name: `${list}, item ${n}`, exact: true });
  await expect(item).toBeVisible();
  return item;
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 740, height: 360 },
]) {
  test.describe(`quests, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('the quests kit ticked by touch, a stage whose objectives lead on and count, and its map, all in reach', async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      await showProject(page);
      await page.getByRole('button', { name: 'New project' }).tap();
      await page.getByLabel('Name').fill('Yard');
      await page.getByRole('button', { name: 'Create' }).tap();
      await expect(openProject(page).getByRole('heading', { name: 'Yard' })).toBeVisible();
      await openProject(page).getByRole('group', { name: 'Kits' }).getByLabel('Quests', { exact: true }).tap();
      await expectFits(page, '[data-panel="project"]');

      await page.getByRole('tab', { name: 'Records' }).tap();
      await page.getByLabel('Type', { exact: true }).selectOption('quest');
      await page.getByRole('button', { name: 'New quest', exact: true }).tap();
      await page.getByLabel('Name of the new quest').fill('Debt');
      await page.getByRole('button', { name: 'Create' }).tap();
      const quest = page.getByRole('region', { name: 'Quest debt' });
      await expect(quest).toBeVisible();
      await quest.getByLabel('Starts with the game (optional)', { exact: true }).tap();

      const owed = await tapAdd(quest, 'Stages', 1);
      await owed.getByLabel('Id', { exact: true }).fill('owed');
      await owed.getByLabel(/^Log/).fill('A miner wants 30 credits back.');
      const pay = await tapAdd(owed, 'Objectives', 1);
      await pay.getByLabel('Id', { exact: true }).fill('pay');
      await pay.getByLabel(/^Text/).fill('Pay the miner');
      await pay.getByLabel(/^Done when/).fill('quests.count(quest: debt, objective: scrap) >= 3');
      await pay.getByLabel(/^Leads to/).fill('square');
      const scrap = await tapAdd(owed, 'Objectives', 2);
      await scrap.getByLabel('Id', { exact: true }).fill('scrap');
      await scrap.getByLabel(/^Text/).fill('Scrap three drones');
      await scrap.getByRole('button', { name: 'Add Count', exact: true }).tap();
      const count = scrap.getByRole('group', { name: 'Count (optional)', exact: true });
      await count.getByLabel('Event', { exact: true }).fill('quests/staged');
      await count.getByRole('textbox', { name: /^Times/ }).fill('3');
      const square = await tapAdd(quest, 'Stages', 2);
      await square.getByLabel('Id', { exact: true }).fill('square');
      await square.getByLabel(/^Log/).fill('The miner shook your hand.');
      await expect
        .poll(() => stored(page, 'yard', 'records/quest/debt.json'))
        .toEqual({
          name: 'Debt',
          'at-start': true,
          stages: [
            {
              id: 'owed',
              log: 'A miner wants 30 credits back.',
              objectives: [
                {
                  id: 'pay',
                  text: 'Pay the miner',
                  'done-when': 'quests.count(quest: debt, objective: scrap) >= 3',
                  next: 'square',
                },
                { id: 'scrap', text: 'Scrap three drones', count: { event: 'quests/staged', to: 3 } },
              ],
            },
            { id: 'square', log: 'The miner shook your hand.' },
          ],
        });

      // The map, at the top of the form: a tap on a box opens its stage.
      const map = quest.getByRole('region', { name: 'Map of the quest' });
      await expect(map.getByRole('heading', { name: '1 step on', exact: true })).toBeVisible();
      await map.getByRole('button', { name: /^square/ }).tap();
      await expect(square.getByLabel('Id', { exact: true })).toBeFocused();
      // A stage nothing leads to yet, its log still to write: the smallest box keeps 44 px.
      const later = await tapAdd(quest, 'Stages', 3);
      await later.getByLabel('Id', { exact: true }).fill('later');
      await expect(map.getByRole('heading', { name: 'Not reached from the first stage', exact: true })).toBeVisible();
      await expectFits(page, '[data-panel="inspector"]');
      expect(errors).toEqual([]);
    });
  });
}
