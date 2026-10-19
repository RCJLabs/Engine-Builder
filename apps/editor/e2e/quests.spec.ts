/**
 * M3.9 on desktop: the quests kit turned on beside Time; a flag; a quest made with forms, its first
 * stage with an objective done by a condition, one counted, which names neither until it does, and
 * one reading the count, a stage nothing brings the quest to until an objective leads there, a
 * failing stage, and a deadline; the map's rows as the quest grows, and a box tapped to open its stage;
 * the warning that nothing starts it until it starts with the game; a row moving it to a stage,
 * whose condition names a stage the quest lacks until it is fixed; and the export checked clean
 * by `eb` (the gate). Then the yard fixture's game run in the editor, its quests' states reported
 * after its own metrics, as `eb sim` reports them.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';
import { createProject, fixtureZip, kitsBox, newRecord, pick, showLogic, stored } from './kitHelpers.ts';
import { importLudus, openProject, openRecord, REPO, scratch, showProject } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const YARD = join(REPO, 'tools/cli/test/fixtures/yard');

/** An item added to a list in `scope`, as its group. */
async function addTo(scope: Locator, list: string, n: number): Promise<Locator> {
  await scope.getByRole('button', { name: `Add to ${list}`, exact: true }).click();
  const item = scope.getByRole('group', { name: `${list}, item ${n}`, exact: true });
  await expect(item).toBeVisible();
  return item;
}

/** A stage added to the quest with its id: filled before its objectives, whose ids it would share a label with. */
async function addStage(quest: Locator, n: number, id: string, log?: string): Promise<Locator> {
  const stage = await addTo(quest, 'Stages', n);
  await stage.getByLabel('Id', { exact: true }).fill(id);
  if (log !== undefined) await stage.getByLabel(/^Log/).fill(log);
  return stage;
}

async function addObjective(stage: Locator, n: number, id: string, text: string): Promise<Locator> {
  const objective = await addTo(stage, 'Objectives', n);
  await objective.getByLabel('Id', { exact: true }).fill(id);
  await objective.getByLabel(/^Text/).fill(text);
  return objective;
}

/** A flag, made in the Logic panel, where flags are. */
async function newFlag(page: Page, name: string): Promise<void> {
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'New flag' }).click();
  await panel.getByLabel('Name of the new flag').fill(name);
  await panel.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('region', { name: `Flag ${name.toLowerCase()}` })).toBeVisible();
}

/** The map's row under `title`. The heading it has is found within each row, so it starts from the page. */
function mapRow(quest: Locator, title: string): Locator {
  const map = quest.getByRole('region', { name: 'Map of the quest' });
  return map.locator('.kit-map-row', { has: quest.page().getByRole('heading', { name: title, exact: true }) });
}

/** Owed: pay, done once the flag is on, leading to square; scrap, counted, which names nothing until it does. */
async function makeOwed(quest: Locator): Promise<void> {
  const owed = await addStage(quest, 1, 'owed', 'A miner wants 30 credits back within five days.');
  await owed.getByRole('textbox', { name: /^Days/ }).fill('5');
  await owed.getByLabel(/^Why it fails/).fill('The miner came for it.');
  const pay = await addObjective(owed, 1, 'pay', 'Pay the miner');
  await pay.getByLabel(/^Done when/).fill('flag.on(paid)');
  await pay.getByLabel(/^Leads to/).fill('square');
  const scrap = await addObjective(owed, 2, 'scrap', 'Scrap three drones');
  await scrap.getByLabel(/^Leads to/).press('Tab');
  // Neither Done when nor Count: E035 at the objective's box, gone once it is counted.
  const neither = scrap.getByText('An objective is done by Done when or by Count: give one');
  await expect(neither).toBeVisible();
  const count = scrap.getByRole('group', { name: 'Count (optional)', exact: true });
  await scrap.getByRole('button', { name: 'Add Count', exact: true }).click();
  await count.getByLabel('Event', { exact: true }).fill('flag/changed');
  await count.getByRole('textbox', { name: /^Times/ }).fill('3');
  await count.getByRole('textbox', { name: /^Times/ }).press('Tab');
  await expect(neither).toHaveCount(0);
}

/** The miner's debt, made with forms, its map read as it grows. */
async function makeQuest(page: Page): Promise<Locator> {
  const quest = await newRecord(page, 'quest', 'Quest', 'Debt');
  await makeOwed(quest);
  await addStage(quest, 2, 'square', 'The miner shook your hand.');
  const hunted = await addStage(quest, 3, 'hunted', 'His friends found you.');
  await hunted.getByLabel('Fails (optional)', { exact: true }).check();
  // Nothing brings the quest to hunted (W124): at its id, and in the map's last row.
  const lost = quest.getByText('Nothing brings the quest here: no Then or Leads to from its first stage');
  await expect(lost).toBeVisible();
  await expect(mapRow(quest, 'Not reached from the first stage').getByRole('button')).toHaveText([/^hunted/]);
  const run = await addObjective(
    quest.getByRole('group', { name: 'Stages, item 1', exact: true }),
    3,
    'run',
    'Or scrap two and run',
  );
  await run.getByLabel(/^Done when/).fill('quests.count(quest: debt, objective: scrap) >= 2');
  await run.getByLabel(/^Leads to/).fill('hunted');
  await run.getByLabel(/^Leads to/).press('Tab');
  await expect(lost).toHaveCount(0);
  await expect(mapRow(quest, 'Not reached from the first stage')).toHaveCount(0);
  // Scrap leads nowhere, so once it is counted the stage is done, and with no Then, the quest.
  await expect(mapRow(quest, 'Starts at').getByRole('button')).toContainText(
    '“Pay the miner” → square“Or scrap two and run” → huntedThen → the quest is doneFails after 5 days',
  );
  await expect(mapRow(quest, '1 step on').getByRole('button')).toHaveText([
    /^squareThe miner shook your hand\.Then → the quest is done$/,
    /^huntedHis friends found you\.Fails as it is reached$/,
  ]);
  // A box tapped opens its stage's form at its id.
  await mapRow(quest, '1 step on')
    .getByRole('button', { name: /^hunted/ })
    .click();
  await expect(
    quest.getByRole('group', { name: 'Stages, item 3', exact: true }).getByLabel('Id', { exact: true }),
  ).toBeFocused();
  return quest;
}

const DEBT = {
  name: 'Debt',
  'at-start': true,
  stages: [
    {
      id: 'owed',
      log: 'A miner wants 30 credits back within five days.',
      days: 5,
      why: 'The miner came for it.',
      objectives: [
        { id: 'pay', text: 'Pay the miner', 'done-when': 'flag.on(paid)', next: 'square' },
        { id: 'scrap', text: 'Scrap three drones', count: { event: 'flag/changed', to: 3 } },
        {
          id: 'run',
          text: 'Or scrap two and run',
          'done-when': 'quests.count(quest: debt, objective: scrap) >= 2',
          next: 'hunted',
        },
      ],
    },
    { id: 'square', log: 'The miner shook your hand.' },
    { id: 'hunted', log: 'His friends found you.', fails: true },
  ],
};

/**
 * A row paying the miner and moving the debt on as a day starts while it is owed: a stage the
 * quest lacks is E043 until fixed.
 */
async function makeRow(page: Page): Promise<Locator> {
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'New sheet' }).click();
  await panel.getByLabel('Name of the new sheet').fill('Yard');
  await panel.getByRole('button', { name: 'Create' }).click();
  const sheet = page.getByRole('region', { name: 'Trigger sheet yard' });
  await sheet.getByRole('button', { name: 'Add a row' }).click();
  const row = sheet.getByRole('group', { name: 'Row 1: row-1' });
  await row
    .getByRole('group', { name: 'When' })
    .getByLabel('Event', { exact: true })
    .selectOption({ label: 'A day starts' });
  await row.getByLabel(/^If/).fill('quests.reached(quest: debt, stage: paid)');
  await row.getByLabel(/^If/).press('Tab');
  const paid = row.getByText('The quest debt has no stage paid: its stages are owed, square, hunted');
  await expect(paid).toBeVisible();
  await row.getByLabel(/^If/).fill('quests.stage(quest: debt) == owed');
  await row.getByLabel(/^If/).press('Tab');
  await expect(paid).toHaveCount(0);
  const effects = row.getByRole('group', { name: 'Do' });
  await effects.getByLabel('Effect to add to Do', { exact: true }).selectOption({ label: 'Set a flag' });
  await effects.getByRole('button', { name: 'Add effect to Do', exact: true }).click();
  await effects.getByLabel('Flag', { exact: true }).selectOption('paid');
  await effects.getByLabel('Effect to add to Do', { exact: true }).selectOption({ label: 'Set a quest’s stage' });
  await effects.getByRole('button', { name: 'Add effect to Do', exact: true }).click();
  const moves = effects.getByRole('listitem').nth(1);
  await pick(page, moves, /^Quest Not chosen/, 'Choose a quest', 'Debt (debt)');
  await moves.getByLabel(/^Stage/).fill('square');
  await moves.getByLabel(/^Stage/).press('Tab');
  await expect
    .poll(() => stored(page, 'yard', 'records/sheet/yard.json'))
    .toEqual({
      name: 'Yard',
      rows: [
        {
          id: 'row-1',
          when: { event: 'time/day-started' },
          if: 'quests.stage(quest: debt) == owed',
          do: [
            { effect: 'set-flag', flag: 'paid', to: true },
            { effect: 'set-stage', quest: 'debt', stage: 'square' },
          ],
        },
      ],
    });
  return panel;
}

test('the quests kit on, a quest made with forms and seen on its map, a row moving it, the export clean', async ({
  page,
}) => {
  // A flag, a quest of three stages and a row made by hand, each checked as it lands.
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await createProject(page, 'Yard');
  await kitsBox(page).getByLabel('Quests', { exact: true }).check();
  await kitsBox(page).getByLabel('Time', { exact: true }).check();
  await expect.poll(() => stored(page, 'yard', 'project.json')).toMatchObject({ kits: ['time', 'quests'] });
  await expectNothingOffscreen(page);

  await newFlag(page, 'Paid');
  const quest = await makeQuest(page);
  // Whole, it is warned that nothing starts it (W125), until it starts with the game.
  const unstarted = quest.getByText('Nothing starts it: it isn’t at the start, has no Starts when');
  await expect(unstarted).toBeVisible();
  await quest.getByLabel('Starts with the game (optional)', { exact: true }).check();
  await expect(unstarted).toHaveCount(0);
  await expect.poll(() => stored(page, 'yard', 'records/quest/debt.json')).toEqual(DEBT);
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  const panel = await makeRow(page);
  await expect(panel.getByRole('button', { name: /^1\. row-1/ })).toContainText(
    'When a day startsIf debt is at its stage owedDo: set paid to on, then move debt to its stage square',
  );
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  await showProject(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openProject(page).getByRole('button', { name: 'Export zip' }).click(),
  ]);
  const exported = join(scratch, 'yard.zip');
  await download.saveAs(exported);
  expect(execFileSync('node', ['tools/cli/src/cli.ts', 'validate', exported], { cwd: REPO, encoding: 'utf8' })).toMatch(
    /^3 records: no problems, hash [0-9a-f]{16}\.\n$/,
  );
  expect(errors).toEqual([]);
});

test('a project’s own quest type, with the kit off, gets its form and no map, though shaped like a quest (D41)', async ({
  page,
}) => {
  const errors = watchErrors(page);
  // Stages as the kit's quest has them, so a map would have stages to draw.
  const stages = { kind: 'list', of: { kind: 'group', fields: { id: { kind: 'text' }, log: { kind: 'text' } } } };
  await importLudus(page, {
    'types/quest.json': JSON.stringify({ title: 'Quest', fields: { stages } }),
    'records/quest/hunt.json': JSON.stringify({ stages: [{ id: 'start', log: 'Find the beast' }] }),
  });
  const form = await openRecord(page, 'quest', 'hunt');
  await expect(form.getByRole('group', { name: 'Stages, item 1', exact: true }).getByLabel(/^Log/)).toHaveValue(
    'Find the beast',
  );
  await expect(form.getByRole('region', { name: 'Map of the quest' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the yard’s game runs in the editor with its quests reported, as eb sim reports them', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(fixtureZip(YARD, 'yard'));
  await expect(openProject(page).getByRole('heading', { name: 'The yard' })).toBeVisible();
  await expect(kitsBox(page).getByLabel('Quests', { exact: true })).toBeChecked();
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'Run its scripts' }).click();
  await expect(
    panel.getByText(/^The game: inventory, economy, time, events, quests, yard, starting in yard/),
  ).toBeVisible();
  await panel.getByLabel('Bot').selectOption('scavenger');
  await panel.getByRole('button', { name: 'Run 20 games' }).click();
  const report = panel.locator('.logic-report');
  await expect(report).toContainText('yard: 20 runs with the scavenger policy');
  await expect(report).toContainText('The miner’s debt (debt): ');
  const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'sim', YARD, '--seeds', '20', '--policy', 'scavenger'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  expect(`${await report.textContent()}\n`).toBe(cli);
  expect(errors).toEqual([]);
});
