/**
 * M3.10 on phones, portrait and landscape: a quest's slot and a stage's job filled in by touch in
 * the inspector's sheet, the slot picked for an effect's actor, and the map's line for a gone
 * record and its job's outcomes. All in reach, with nothing past the screen's edge.
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
  test.describe(`slots, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('a slot and a job filled in by touch, the slot picked for an effect, and the map, all in reach', async ({
      page,
    }) => {
      test.setTimeout(60_000);
      const errors = watchErrors(page);
      await page.goto('./');
      await showProject(page);
      await page.getByRole('button', { name: 'New project' }).tap();
      await page.getByLabel('Name').fill('School');
      await page.getByRole('button', { name: 'Create' }).tap();
      await expect(openProject(page).getByRole('heading', { name: 'School' })).toBeVisible();
      const kits = openProject(page).getByRole('group', { name: 'Kits' });
      for (const kit of ['Stats', 'Time', 'Roster', 'Quests']) await kits.getByLabel(kit, { exact: true }).tap();

      await page.getByRole('tab', { name: 'Records' }).tap();
      await page.getByLabel('Type', { exact: true }).selectOption('quest');
      await page.getByRole('button', { name: 'New quest', exact: true }).tap();
      await page.getByLabel('Name of the new quest').fill('Booking');
      await page.getByRole('button', { name: 'Create' }).tap();
      const quest = page.getByRole('region', { name: 'Quest booking' });
      await expect(quest).toBeVisible();

      const man = await tapAdd(quest, 'Slots', 1);
      await man.getByLabel('Id', { exact: true }).fill('man');
      await man.getByLabel('Type', { exact: true }).fill('actor');
      await man.getByLabel(/^Where/).fill('roster.member(@man)');
      await man.getByLabel(/^Keeps while/).fill('roster.member(@man)');
      await man.getByLabel(/^When gone, goes to/).fill('lost');

      const games = await tapAdd(quest, 'Stages', 1);
      await games.getByLabel('Id', { exact: true }).fill('games');
      await games.getByRole('button', { name: 'Add Job', exact: true }).tap();
      const job = games.getByRole('group', { name: 'Job (optional)', exact: true });
      await job.getByLabel('New key for Takes').fill('days');
      await job.getByRole('button', { name: 'Add to Takes' }).tap();
      await job.getByLabel('Takes: days', { exact: true }).fill('1');
      const won = await tapAdd(job, 'Outcomes', 1);
      await won.getByRole('textbox', { name: /^Chance/ }).fill('100');
      await won.getByLabel(/^Leads to/).fill('won');

      const after = await tapAdd(quest, 'Stages', 2);
      await after.getByLabel('Id', { exact: true }).fill('won');
      const effects = after.getByRole('group', { name: 'Effects (optional)', exact: true });
      await effects.getByLabel('Effect to add to Effects', { exact: true }).selectOption({ label: 'Leave the roster' });
      await effects.getByRole('button', { name: 'Add effect to Effects', exact: true }).tap();
      await effects.getByRole('button', { name: /^Actor Not chosen/ }).tap();
      await page
        .getByRole('dialog', { name: 'Choose an actor' })
        .getByRole('option', { name: 'The actor in the slot man (@man)' })
        .tap();
      await effects.getByLabel(/^Why/).fill('freed');
      const lost = await tapAdd(quest, 'Stages', 3);
      await lost.getByLabel('Id', { exact: true }).fill('lost');
      await lost.getByLabel('Fails (optional)', { exact: true }).tap();
      await expect
        .poll(() => stored(page, 'school', 'records/quest/booking.json'))
        .toMatchObject({
          slots: [{ id: 'man', type: 'actor', keeps: 'roster.member(@man)', gone: 'lost' }],
          stages: [
            { id: 'games', job: { takes: { days: 1 }, outcomes: [{ chance: 100, next: 'won' }] } },
            { id: 'won', effects: [{ effect: 'leave', actor: '@man', why: 'freed' }] },
            { id: 'lost', fails: true },
          ],
        });

      const map = quest.getByRole('region', { name: 'Map of the quest' });
      await expect(map.getByText('If man is gone → lost', { exact: true })).toBeVisible();
      await expect(map.getByRole('button', { name: /^games/ })).toContainText('100% → won');
      await expectFits(page, '[data-panel="inspector"]');
      expect(errors).toEqual([]);
    });
  });
}
