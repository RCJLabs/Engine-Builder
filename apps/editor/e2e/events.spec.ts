/**
 * M3.7 on desktop: the events kit turned on beside Economy and Time; two events made with forms,
 * one with a choice that costs, one that rolls two outcomes whose chances don't add up until they
 * are fixed, and a consequence two days later inside an outcome; a deck drawing them; rows on a
 * day's start and on a choice, one whose condition names a choice the event lacks until it is
 * fixed; and the export checked clean by `eb` (the gate). Then the convoy fixture's game run in
 * the editor with its four kits joined, as `eb sim` plays it.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';
import { createProject, fixtureZip, kitsBox, newRecord, pick, showLogic, stored } from './kitHelpers.ts';
import { openProject, REPO, scratch, showProject } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const CONVOY = join(REPO, 'tools/cli/test/fixtures/convoy');

/** A choice added to an event's Choices, with its id and label. */
async function addChoice(form: Locator, n: number, id: string, label: string): Promise<Locator> {
  await form.getByRole('button', { name: 'Add to Choices' }).click();
  const choice = form.getByRole('group', { name: `Choices, item ${n}`, exact: true });
  await choice.getByLabel('Id', { exact: true }).fill(id);
  await choice.getByLabel('Label', { exact: true }).fill(label);
  return choice;
}

async function addEffect(scope: Locator, list: string, label: string): Promise<void> {
  await scope.getByLabel(`Effect to add to ${list}`, { exact: true }).selectOption({ label });
  await scope.getByRole('button', { name: `Add effect to ${list}`, exact: true }).click();
}

/** Pursuit: one choice, always open. */
async function makePursuit(page: Page): Promise<void> {
  const pursuit = await newRecord(page, 'event', 'Event', 'Pursuit');
  await addChoice(pursuit, 1, 'outrun', 'Outrun them');
  await expect
    .poll(() => stored(page, 'road', 'records/event/pursuit.json'))
    .toEqual({ name: 'Pursuit', choices: [{ id: 'outrun', label: 'Outrun them' }] });
}

/** Raiders: a toll that costs scrap, a fight at 60 to 40 whose worse outcome brings pursuit two days on, and hiding. */
async function makeRaiders(page: Page): Promise<void> {
  const raiders = await newRecord(page, 'event', 'Event', 'Raiders');
  await raiders.getByLabel(/^Text/).fill('Bikes on the ridge.');
  const pay = await addChoice(raiders, 1, 'pay', 'Pay the toll');
  await pay.getByRole('button', { name: 'Add to Cost' }).click();
  await page.getByRole('dialog', { name: 'Add to Cost' }).getByRole('option', { name: 'Scrap (scrap)' }).click();
  await pay.getByLabel('Cost: scrap', { exact: true }).fill('20');
  // A list of effects says what it is for, as every other field does.
  await expect(pay.getByRole('group', { name: 'Effects (optional)', exact: true })).toHaveAccessibleDescription(
    'What it does for sure',
  );
  const fight = await addChoice(raiders, 2, 'fight', 'Fight');
  const outcomes = fight.getByRole('group', { name: 'Outcomes (optional)', exact: true });
  await fight.getByRole('button', { name: 'Add to Outcomes' }).click();
  await fight.getByRole('button', { name: 'Add to Outcomes' }).click();
  const better = outcomes.getByRole('group', { name: 'Outcomes, item 1', exact: true });
  const worse = outcomes.getByRole('group', { name: 'Outcomes, item 2', exact: true });
  await better.getByRole('textbox', { name: /^Chance/ }).fill('60');
  await worse.getByRole('textbox', { name: /^Chance/ }).fill('30');
  await worse.getByRole('textbox', { name: /^Chance/ }).press('Tab');
  // Chances that don't add up show why at the outcomes' box, as the compiler's E035, and go once fixed.
  const short = fight.getByText('Its chances add up to 90: they add up to 100');
  await expect(short).toBeVisible();
  await worse.getByRole('textbox', { name: /^Chance/ }).fill('40');
  await expect(short).toHaveCount(0);
  await worse.getByLabel(/^Result/).fill('They hole the tank.');
  await addEffect(worse, 'Effects', 'Do later');
  await worse.getByRole('group', { name: 'After', exact: true }).getByLabel(/^Days/).fill('2');
  await addEffect(worse, 'Do', 'Open an event');
  await pick(
    page,
    worse.getByRole('group', { name: 'Do', exact: true }),
    /^Event/,
    'Choose an event',
    'Pursuit (pursuit)',
  );
  await worse.getByLabel(/^Id/).fill('pursuit');
  await addChoice(raiders, 3, 'hide', 'Hide');
  await expect
    .poll(() => stored(page, 'road', 'records/event/raiders.json'))
    .toEqual({
      name: 'Raiders',
      text: 'Bikes on the ridge.',
      choices: [
        { id: 'pay', label: 'Pay the toll', cost: { scrap: 20 } },
        {
          id: 'fight',
          label: 'Fight',
          outcomes: [
            { chance: 60, effects: [] },
            {
              chance: 40,
              result: 'They hole the tank.',
              effects: [
                {
                  effect: 'later',
                  after: { days: 2 },
                  do: [{ effect: 'open-event', event: 'pursuit' }],
                  id: 'pursuit',
                },
              ],
            },
          ],
        },
        { id: 'hide', label: 'Hide' },
      ],
    });
  // The consequence in words, as a row's card would say it.
  await expect(worse.getByText('1. pursuit: do 1 effect after 2 days')).toBeVisible();
}

/** The road: raiders twice as likely as pursuit. */
async function makeRoad(page: Page): Promise<void> {
  const road = await newRecord(page, 'deck', 'Deck', 'Road');
  for (const [n, option] of ['Raiders (raiders)', 'Pursuit (pursuit)'].entries()) {
    await road.getByRole('button', { name: 'Add to Events' }).click();
    await pick(page, road.getByRole('group', { name: `Events, item ${n + 1}` }), /^Event/, 'Choose an event', option);
  }
  await road
    .getByRole('group', { name: 'Events, item 1' })
    .getByRole('textbox', { name: /^Weight/ })
    .fill('2');
  await expect
    .poll(() => stored(page, 'road', 'records/deck/road.json'))
    .toEqual({ name: 'Road', events: [{ event: 'raiders', weight: 2 }, { event: 'pursuit' }] });
}

/** A row: its event, then each effect added by its form. */
async function newRow(sheet: Locator, n: number, event: string): Promise<Locator> {
  await sheet.getByRole('button', { name: 'Add a row' }).click();
  const row = sheet.getByRole('group', { name: `Row ${n}: row-${n}` });
  await row.getByRole('group', { name: 'When' }).getByLabel('Event', { exact: true }).selectOption({ label: event });
  return row;
}

/** Rows on a day's start, drawing from the road, and on a choice, paying for a fight won. */
async function makeRows(page: Page): Promise<Locator> {
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'New sheet' }).click();
  await panel.getByLabel('Name of the new sheet').fill('Road');
  await panel.getByRole('button', { name: 'Create' }).click();
  const sheet = page.getByRole('region', { name: 'Trigger sheet road' });
  const day = await newRow(sheet, 1, 'A day starts');
  const draw = day.getByRole('group', { name: 'Do' });
  await addEffect(draw, 'Do', 'Draw an event');
  await pick(page, draw, /^Deck Not chosen/, 'Choose a deck', 'Road (road)');
  const chosen = await newRow(sheet, 2, 'A choice is made');
  // A choice the event lacks is the condition's problem, at its box (E041).
  await chosen.getByLabel(/^If/).fill('events.chose(event: raiders, choice: run)');
  await chosen.getByLabel(/^If/).press('Tab');
  const run = chosen.getByText('The event raiders has no choice run: its choices are pay, fight, hide');
  await expect(run).toBeVisible();
  await chosen.getByLabel(/^If/).fill('events.chose(event: raiders, choice: fight)');
  await chosen.getByLabel(/^If/).press('Tab');
  await expect(run).toHaveCount(0);
  const spoils = chosen.getByRole('group', { name: 'Do' });
  await addEffect(spoils, 'Do', 'Add to a resource');
  await pick(page, spoils, /^Resource Not chosen/, 'Choose a resource', 'Scrap (scrap)');
  await spoils.getByLabel(/^By/).fill('5');
  await expect
    .poll(() => stored(page, 'road', 'records/sheet/road.json'))
    .toEqual({
      name: 'Road',
      rows: [
        { id: 'row-1', when: { event: 'time/day-started' }, do: [{ effect: 'draw-event', deck: 'road' }] },
        {
          id: 'row-2',
          when: { event: 'events/chosen' },
          if: 'events.chose(event: raiders, choice: fight)',
          do: [{ effect: 'add-resource', resource: 'scrap', by: 5 }],
        },
      ],
    });
  return panel;
}

test('the events kit on, an event with a cost and odds, a consequence, a deck and rows, the export clean', async ({
  page,
}) => {
  // Five records and two rows made by hand, each checked as it lands.
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await createProject(page, 'Road');
  await kitsBox(page).getByLabel('Events', { exact: true }).check();
  await kitsBox(page).getByLabel('Economy', { exact: true }).check();
  await kitsBox(page).getByLabel('Time', { exact: true }).check();
  await expect
    .poll(() => stored(page, 'road', 'project.json'))
    .toMatchObject({ kits: ['inventory', 'economy', 'time', 'events'] });
  await expectNothingOffscreen(page);

  const scrap = await newRecord(page, 'resource', 'Resource', 'Scrap');
  await scrap.getByLabel(/^Starts at/).fill('40');
  await makePursuit(page);
  await makeRaiders(page);
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);
  await makeRoad(page);

  const panel = await makeRows(page);
  await expect(panel.getByRole('button', { name: /^1\. row-1/ })).toContainText(
    'When a day startsDo: draw an event from road',
  );
  await expect(panel.getByRole('button', { name: /^2\. row-2/ })).toContainText(
    'When a choice is madeIf fight was chosen at raidersDo: add 5 scrap',
  );
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  await showProject(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openProject(page).getByRole('button', { name: 'Export zip' }).click(),
  ]);
  const exported = join(scratch, 'road.zip');
  await download.saveAs(exported);
  expect(execFileSync('node', ['tools/cli/src/cli.ts', 'validate', exported], { cwd: REPO, encoding: 'utf8' })).toMatch(
    /^5 records: no problems, hash [0-9a-f]{16}\.\n$/,
  );
  expect(errors).toEqual([]);
});

test('the convoy’s game runs in the editor with its four kits joined, as eb sim plays it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(fixtureZip(CONVOY, 'convoy'));
  await expect(openProject(page).getByRole('heading', { name: 'The convoy' })).toBeVisible();
  await expect(kitsBox(page).getByLabel('Events', { exact: true })).toBeChecked();
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'Run its scripts' }).click();
  await expect(
    panel.getByText(/^The game: inventory, economy, time, events, convoy, starting in convoy/),
  ).toBeVisible();
  await panel.getByLabel('Bot').selectOption('scout');
  await panel.getByRole('button', { name: 'Run 20 games' }).click();
  const report = panel.locator('.logic-report');
  await expect(report).toContainText('convoy: 20 runs with the scout policy');
  const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'sim', CONVOY, '--seeds', '20', '--policy', 'scout'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  expect(`${await report.textContent()}\n`).toBe(cli);
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
