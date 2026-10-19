/**
 * M3.10 on desktop: a quest with a slot, made with forms in a project with Stats, Time, Roster and
 * Quests. An objective names a slot the quest lacks until it is fixed (E044); a second slot names a
 * type nothing has (W127) until it is taken out; a stage's job has chances that don't add up to
 * 100 until they do (E035); an effect's actor is the slot, picked from its picker; the map shows the
 * job's outcomes and where the quest goes when the slot's record is gone; and the export is checked
 * clean by `eb` (the gate). Then the school fixture's game run in the editor, a booking's runs
 * counted as `eb sim` counts them.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';
import { createProject, fixtureZip, kitsBox, newRecord, pick, showLogic, stored } from './kitHelpers.ts';
import { openProject, REPO, scratch, showProject } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const SCHOOL = join(REPO, 'tools/cli/test/fixtures/school');

/** An item added to a list in `scope`, as its group. */
async function addTo(scope: Locator, list: string, n: number): Promise<Locator> {
  await scope.getByRole('button', { name: `Add to ${list}`, exact: true }).click();
  const item = scope.getByRole('group', { name: `${list}, item ${n}`, exact: true });
  await expect(item).toBeVisible();
  return item;
}

async function addStage(quest: Locator, n: number, id: string, log?: string): Promise<Locator> {
  const stage = await addTo(quest, 'Stages', n);
  await stage.getByLabel('Id', { exact: true }).fill(id);
  if (log !== undefined) await stage.getByLabel(/^Log/).fill(log);
  return stage;
}

function mapRow(quest: Locator, title: string): Locator {
  const map = quest.getByRole('region', { name: 'Map of the quest' });
  return map.locator('.kit-map-row', { has: quest.page().getByRole('heading', { name: title, exact: true }) });
}

/** The slot man: an actor on the roster, picked at random, sent, kept while he stays. */
async function makeSlot(quest: Locator): Promise<void> {
  const man = await addTo(quest, 'Slots', 1);
  await man.getByLabel('Id', { exact: true }).fill('man');
  await man.getByLabel('Type', { exact: true }).fill('actor');
  await man.getByLabel(/^Where/).fill('roster.member(@man)');
  await man.getByLabel(/^Pick/).selectOption('random');
  await man.getByLabel('Goes (optional)', { exact: true }).check();
  await man.getByLabel(/^Keeps while/).fill('roster.member(@man)');
  await man.getByLabel(/^When gone, goes to/).fill('forfeit');
}

/** A second slot, of a type nothing has (W127), checked once the quest has its stages, then taken out. */
async function tryPrize(quest: Locator): Promise<void> {
  const prize = await addTo(quest, 'Slots', 2);
  await prize.getByLabel('Id', { exact: true }).fill('prize');
  await prize.getByLabel('Type', { exact: true }).fill('laurel');
  await prize.getByLabel(/^Where/).fill('roster.member(@man)');
  await prize.getByLabel(/^Where/).press('Tab');
  const nothing = prize.getByText('No laurel record is written, and nothing in this game makes one');
  await expect(nothing).toBeVisible();
  await quest.getByRole('button', { name: 'Remove Slots item 2' }).click();
  await expect(nothing).toHaveCount(0);
}

/** Booked: an objective naming a slot the quest lacks (E044) until it names man. */
async function makeBooked(quest: Locator): Promise<void> {
  const booked = await addStage(quest, 1, 'booked', '{man} is booked for the games.');
  await booked.getByLabel(/^Then/).fill('games');
  const ready = await addTo(booked, 'Objectives', 1);
  await ready.getByLabel('Id', { exact: true }).fill('ready');
  await ready.getByLabel(/^Text/).fill('Get {man} to 4 fame');
  await ready.getByLabel(/^Done when/).fill('stats.value(actor: @mann, stat: fame) >= 4');
  await ready.getByLabel(/^Done when/).press('Tab');
  const lacks = ready.getByText('No slot mann here: the slots are man');
  await expect(lacks).toBeVisible();
  await ready.getByLabel(/^Done when/).fill('stats.value(actor: @man, stat: fame) >= 4');
  await ready.getByLabel(/^Done when/).press('Tab');
  await expect(lacks).toHaveCount(0);
}

/** The games: a job of two days whose chances add up to 90 (E035) until they add up to 100. */
async function makeGames(quest: Locator): Promise<void> {
  const games = await addStage(quest, 2, 'games', '{man} fights at the games.');
  await games.getByRole('button', { name: 'Add Job', exact: true }).click();
  const job = games.getByRole('group', { name: 'Job (optional)', exact: true });
  await job.getByLabel('New key for Takes').fill('days');
  await job.getByRole('button', { name: 'Add to Takes' }).click();
  await job.getByLabel('Takes: days', { exact: true }).fill('2');
  const won = await addTo(job, 'Outcomes', 1);
  await won.getByRole('textbox', { name: /^Chance/ }).fill('60');
  await won.getByLabel(/^Leads to/).fill('won');
  const beaten = await addTo(job, 'Outcomes', 2);
  await beaten.getByRole('textbox', { name: /^Chance/ }).fill('30');
  await beaten.getByLabel(/^Leads to/).fill('beaten');
  await beaten.getByLabel(/^Leads to/).press('Tab');
  const ninety = job.getByText('Its chances add up to 90, not 100');
  await expect(ninety).toBeVisible();
  await beaten.getByRole('textbox', { name: /^Chance/ }).fill('40');
  await beaten.getByRole('textbox', { name: /^Chance/ }).press('Tab');
  await expect(ninety).toHaveCount(0);
}

/** Won: fame for the man in the slot, picked from the actor's picker, where the slot comes first. */
async function makeWon(page: Page, quest: Locator): Promise<void> {
  const won = await addStage(quest, 3, 'won', '{man} won the crowd.');
  const effects = won.getByRole('group', { name: 'Effects (optional)', exact: true });
  await effects.getByLabel('Effect to add to Effects', { exact: true }).selectOption({ label: 'Add to a stat’s base' });
  await effects.getByRole('button', { name: 'Add effect to Effects', exact: true }).click();
  await pick(page, effects, /^Actor Not chosen/, 'Choose an actor', 'The actor in the slot man (@man)');
  await pick(page, effects, /^Stat Not chosen/, 'Choose a stat', 'Fame (fame)');
  await effects.getByRole('textbox', { name: /^By/ }).fill('2');
  await effects.getByRole('textbox', { name: /^By/ }).press('Tab');
}

const BOOKING = {
  name: 'Booking',
  'at-start': true,
  slots: [
    {
      id: 'man',
      type: 'actor',
      where: 'roster.member(@man)',
      pick: 'random',
      goes: true,
      keeps: 'roster.member(@man)',
      gone: 'forfeit',
    },
  ],
  stages: [
    {
      id: 'booked',
      log: '{man} is booked for the games.',
      next: 'games',
      objectives: [
        { id: 'ready', text: 'Get {man} to 4 fame', 'done-when': 'stats.value(actor: @man, stat: fame) >= 4' },
      ],
    },
    {
      id: 'games',
      log: '{man} fights at the games.',
      job: {
        takes: { days: 2 },
        outcomes: [
          { chance: 60, next: 'won' },
          { chance: 40, next: 'beaten' },
        ],
      },
    },
    {
      id: 'won',
      log: '{man} won the crowd.',
      effects: [{ effect: 'add-to-stat', actor: '@man', stat: 'fame', by: 2 }],
    },
    { id: 'beaten', log: '{man} was beaten.', fails: true },
    { id: 'forfeit', log: '{man} is gone.', fails: true },
  ],
};

test('a quest with a slot and a job, made with forms and seen on its map, the export clean', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await createProject(page, 'School');
  for (const kit of ['Stats', 'Time', 'Roster', 'Quests']) await kitsBox(page).getByLabel(kit, { exact: true }).check();
  await expect
    .poll(() => stored(page, 'school', 'project.json'))
    .toMatchObject({ kits: ['stats', 'time', 'roster', 'quests'] });
  await newRecord(page, 'stat', 'Stat', 'Fame');

  const quest = await newRecord(page, 'quest', 'Quest', 'Booking');
  await makeSlot(quest);
  await makeBooked(quest);
  await makeGames(quest);
  await makeWon(page, quest);
  const beaten = await addStage(quest, 4, 'beaten', '{man} was beaten.');
  await beaten.getByLabel('Fails (optional)', { exact: true }).check();
  const forfeit = await addStage(quest, 5, 'forfeit', '{man} is gone.');
  await forfeit.getByLabel('Fails (optional)', { exact: true }).check();
  await quest.getByLabel('Starts with the game (optional)', { exact: true }).check();
  await tryPrize(quest);
  await expect.poll(() => stored(page, 'school', 'records/quest/booking.json')).toEqual(BOOKING);

  // The map: where the quest goes if the man is gone, a step from the first stage, and the job's
  // outcomes by their chances.
  const map = quest.getByRole('region', { name: 'Map of the quest' });
  await expect(map.getByText('If man is gone → forfeit', { exact: true })).toBeVisible();
  await expect(mapRow(quest, '1 step on').getByRole('button')).toHaveText([/^games/, /^forfeit/]);
  await expect(mapRow(quest, '1 step on').getByRole('button', { name: /^games/ })).toContainText(
    '60% → won40% → beaten',
  );
  await expect(mapRow(quest, '2 steps on').getByRole('button')).toHaveText([/^won/, /^beaten/]);
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  await showProject(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openProject(page).getByRole('button', { name: 'Export zip' }).click(),
  ]);
  const exported = join(scratch, 'school.zip');
  await download.saveAs(exported);
  expect(execFileSync('node', ['tools/cli/src/cli.ts', 'validate', exported], { cwd: REPO, encoding: 'utf8' })).toMatch(
    /^2 records: no problems, hash [0-9a-f]{16}\.\n$/,
  );
  expect(errors).toEqual([]);
});

test('the school’s game runs in the editor, a booking’s runs counted, as eb sim counts them', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(fixtureZip(SCHOOL, 'school'));
  await expect(openProject(page).getByRole('heading', { name: 'The school' })).toBeVisible();
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'Run its scripts' }).click();
  await expect(panel.getByText(/^The game: stats, time, roster, quests, school, starting in school/)).toBeVisible();
  await panel.getByLabel('Bot').selectOption('lanista');
  await panel.getByRole('button', { name: 'Run 20 games' }).click();
  const report = panel.locator('.logic-report');
  await expect(report).toContainText('A booking at the games (booking): runs done: ');
  const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'sim', SCHOOL, '--seeds', '20', '--policy', 'lanista'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  expect(`${await report.textContent()}\n`).toBe(cli);
  expect(errors).toEqual([]);
});
