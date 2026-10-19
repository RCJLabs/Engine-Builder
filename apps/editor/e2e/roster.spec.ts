/**
 * M3.6 on desktop: the roster kit turned on, ticking Stats with it, beside Economy; a recruit
 * template with a rolled stat and a trait with a fee, a hall offering it and a roster with ranks
 * and bonds made with forms, a problem shown at its box and fixed; rows on the roster's events,
 * one whose condition names a rank the roster lacks until it is fixed; and the export checked
 * clean by `eb` (the gate). Then the crew fixture's game run in the editor with its five kits
 * joined, as `eb sim` plays it.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';
import { createProject, fixtureZip, kitsBox, newRecord, pick, showLogic, stored } from './kitHelpers.ts';
import { openProject, REPO, scratch, showProject } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const CREW = join(REPO, 'tools/cli/test/fixtures/crew');

/** An entry of a map keyed by records: its key picked in the Add dialog. */
async function addKey(page: Page, scope: Locator, map: string, option: string): Promise<void> {
  await scope.getByRole('button', { name: `Add to ${map}` }).click();
  await page
    .getByRole('dialog', { name: `Add to ${map}` })
    .getByRole('option', { name: option })
    .click();
}

/** The deckhand: two names, aim rolled from 40 to 60, a steady hand at 30% for 15 credits more. */
async function makeDeckhand(page: Page): Promise<void> {
  const deckhand = await newRecord(page, 'recruit', 'Recruit', 'Deckhand');
  await pick(page, deckhand, /^Actor/, 'Choose an actor', 'Hand (hand)');
  const names = deckhand.getByRole('group', { name: 'Names', exact: true });
  for (const [i, name] of ['Ketil', 'Asa'].entries()) {
    await names.getByRole('button', { name: 'Add to Names' }).click();
    await names.getByLabel(`Names, item ${i + 1}`, { exact: true }).fill(name);
  }
  await addKey(page, deckhand, 'Rolled stats', 'Aim (aim)');
  const aim = deckhand.getByRole('group', { name: 'Rolled stats: aim' });
  await aim.getByLabel(/^From/).fill('40');
  await aim.getByLabel(/^To/).fill('30');
  // A range that runs down shows why at its box, as the compiler's E035, and goes once fixed.
  await aim.getByLabel(/^To/).press('Tab');
  const down = deckhand.getByText('aim is rolled from 40 to 30: To is below From');
  await expect(down).toBeVisible();
  await aim.getByLabel(/^To/).fill('60');
  await expect(down).toHaveCount(0);
  const traits = deckhand.getByRole('group', { name: 'Traits (optional)', exact: true });
  await traits.getByRole('button', { name: 'Add to Traits' }).click();
  const steady = traits.getByRole('group', { name: 'Traits, item 1' });
  await pick(page, steady, /^Status/, 'Choose a status', 'Steady (steady)');
  await steady.getByRole('textbox', { name: /^Chance/ }).fill('30');
  await addKey(page, steady, 'Fee', 'Credits (credits)');
  await steady.getByLabel('Fee: credits', { exact: true }).fill('15');
  await deckhand.getByLabel(/^Most traits/).fill('1');
  const own = deckhand.getByRole('group', { name: 'Fee (optional)', exact: true }).last();
  await addKey(page, own, 'Fee', 'Credits (credits)');
  await own.getByLabel('Fee: credits', { exact: true }).fill('30');
  await expect
    .poll(() => stored(page, 'crew', 'records/recruit/deckhand.json'))
    .toEqual({
      name: 'Deckhand',
      actor: 'hand',
      names: ['Ketil', 'Asa'],
      stats: { aim: { min: 40, max: 60 } },
      traits: [{ status: 'steady', chance: 30, fee: { credits: 15 } }],
      most: 1,
      fee: { credits: 30 },
    });
}

/** The crew: four berths, the captain aboard, green until 3 fights, and bonds from 0 to 20. */
async function makeCrew(page: Page): Promise<void> {
  const crew = await newRecord(page, 'roster', 'Roster', 'Crew');
  await crew.getByLabel(/^Most members$|^Most members \(/).fill('4');
  const start = crew.getByRole('group', { name: 'Starts with (optional)', exact: true });
  await start.getByRole('button', { name: 'Add to Starts with' }).click();
  await pick(page, start, /^Starts with, item 1/, 'Choose an actor', 'Captain (captain)');
  await crew.getByRole('button', { name: 'Add Ranks' }).click();
  const ranks = crew.getByRole('group', { name: 'Ranks (optional)', exact: true });
  await pick(page, ranks, /^Stat/, 'Choose a stat', 'Fights (fights)');
  const ladder = ranks.getByRole('group', { name: 'Ranks', exact: true });
  await ladder.getByRole('button', { name: 'Add to Ranks' }).click();
  await ladder.getByRole('group', { name: 'Ranks, item 1' }).getByLabel(/^Id/).fill('green');
  await ladder.getByRole('button', { name: 'Add to Ranks' }).click();
  const veteran = ladder.getByRole('group', { name: 'Ranks, item 2' });
  await veteran.getByLabel(/^Id/).fill('veteran');
  // Only the first rank may leave From out: the second shows why until it says where it begins.
  const from = crew.getByText('veteran says nothing of where it begins: only the first rank can leave From out');
  await expect(from).toBeVisible();
  await veteran.getByLabel(/^From/).fill('3');
  await expect(from).toHaveCount(0);
  await pick(page, veteran, /^Status/, 'Choose a status', 'Seasoned (seasoned)');
  await crew.getByRole('button', { name: 'Add Bonds' }).click();
  const bonds = crew.getByRole('group', { name: 'Bonds (optional)', exact: true });
  await bonds.getByLabel(/^Lowest/).fill('0');
  await bonds.getByLabel(/^Highest/).fill('20');
  const bands = bonds.getByRole('group', { name: 'Bands (optional)', exact: true });
  await bands.getByRole('button', { name: 'Add to Bands' }).click();
  await bands.getByRole('group', { name: 'Bands, item 1' }).getByLabel(/^Id/).fill('strangers');
  await bands.getByRole('button', { name: 'Add to Bands' }).click();
  const mates = bands.getByRole('group', { name: 'Bands, item 2' });
  await mates.getByLabel(/^Id/).fill('mates');
  await mates.getByLabel(/^From/).fill('4');
  await expect
    .poll(() => stored(page, 'crew', 'records/roster/crew.json'))
    .toEqual({
      name: 'Crew',
      cap: 4,
      start: ['captain'],
      ranks: {
        stat: 'fights',
        bands: [{ id: 'green' }, { id: 'veteran', from: 3, status: 'seasoned' }],
      },
      bonds: { min: 0, max: 20, bands: [{ id: 'strangers' }, { id: 'mates', from: 4 }] },
    });
}

/** A row: its event, then each effect added by its form. */
async function newRow(sheet: Locator, n: number, event: string): Promise<Locator> {
  await sheet.getByRole('button', { name: 'Add a row' }).click();
  const row = sheet.getByRole('group', { name: `Row ${n}: row-${n}` });
  await row.getByRole('group', { name: 'When' }).getByLabel('Event', { exact: true }).selectOption({ label: event });
  return row;
}

async function addEffect(does: Locator, label: string): Promise<void> {
  await does.getByLabel('Effect to add to Do').selectOption({ label });
  await does.getByRole('button', { name: 'Add effect to Do' }).click();
}

/** Rows on a hire, a rank changing and a member leaving: bonds, a bounty, and a replacement. */
async function makeRows(page: Page): Promise<Locator> {
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'New sheet' }).click();
  await panel.getByLabel('Name of the new sheet').fill('Crew life');
  await panel.getByRole('button', { name: 'Create' }).click();
  const sheet = page.getByRole('region', { name: 'Trigger sheet crew-life' });
  const hired = await newRow(sheet, 1, 'A recruit is hired');
  const together = hired.getByRole('group', { name: 'Do' });
  await addEffect(together, 'Change every bond');
  await together.getByLabel(/^By/).fill('1');
  const ranked = await newRow(sheet, 2, 'A member’s rank changes');
  // A rank the roster lacks is the condition's problem, at its box (E040).
  await ranked.getByLabel(/^If/).fill('roster.ranked(elite) >= 2');
  await ranked.getByLabel(/^If/).press('Tab');
  const elite = ranked.getByText('The roster has no rank elite: its ranks are green, veteran');
  await expect(elite).toBeVisible();
  await ranked.getByLabel(/^If/).fill('roster.ranked(veteran) >= 2');
  await ranked.getByLabel(/^If/).press('Tab');
  await expect(elite).toHaveCount(0);
  const bounty = ranked.getByRole('group', { name: 'Do' });
  await addEffect(bounty, 'Add to a resource');
  await pick(page, bounty, /^Resource Not chosen/, 'Choose a resource', 'Credits (credits)');
  await bounty.getByLabel(/^By/).fill('20');
  const left = await newRow(sheet, 3, 'A member leaves');
  const again = left.getByRole('group', { name: 'Do' });
  await addEffect(again, 'Make a recruit');
  await pick(page, again, /^Recruit Not chosen/, 'Choose a recruit', 'Deckhand (deckhand)');
  await expect
    .poll(() => stored(page, 'crew', 'records/sheet/crew-life.json'))
    .toEqual({
      name: 'Crew life',
      rows: [
        { id: 'row-1', when: { event: 'roster/hired' }, do: [{ effect: 'change-bonds', by: 1 }] },
        {
          id: 'row-2',
          when: { event: 'roster/rank-changed' },
          if: 'roster.ranked(veteran) >= 2',
          do: [{ effect: 'add-resource', resource: 'credits', by: 20 }],
        },
        { id: 'row-3', when: { event: 'roster/left' }, do: [{ effect: 'recruit', recruit: 'deckhand' }] },
      ],
    });
  return panel;
}

test('the roster kit on, a recruit, a hall and a roster with ranks and bonds, rows on its events, the export clean', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await createProject(page, 'Crew');
  // The roster needs Stats: ticking it ticks both, as one step.
  await kitsBox(page).getByLabel('Roster', { exact: true }).check();
  await expect(kitsBox(page).getByLabel('Stats', { exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Undo: Turn on the roster kit, with stats' })).toBeVisible();
  await kitsBox(page).getByLabel('Economy', { exact: true }).check();
  await expect
    .poll(() => stored(page, 'crew', 'project.json'))
    .toMatchObject({ kits: ['inventory', 'economy', 'stats', 'roster'] });
  await expectNothingOffscreen(page);

  await newRecord(page, 'stat', 'Stat', 'Fights');
  const aim = await newRecord(page, 'stat', 'Stat', 'Aim');
  await aim.getByLabel(/^Highest/).fill('100');
  await newRecord(page, 'status', 'Status', 'Steady');
  await newRecord(page, 'status', 'Status', 'Seasoned');
  await newRecord(page, 'actor', 'Actor', 'Captain');
  await newRecord(page, 'actor', 'Actor', 'Hand');
  const credits = await newRecord(page, 'resource', 'Resource', 'Credits');
  await credits.getByLabel(/^Starts at/).fill('100');
  await makeDeckhand(page);
  const dock = await newRecord(page, 'hall', 'Hall', 'Dock');
  await dock.getByRole('textbox', { name: /^Offers a round/ }).fill('2');
  await dock.getByRole('button', { name: 'Add to Recruits' }).click();
  const offered = dock.getByRole('group', { name: 'Recruits, item 1' });
  await pick(page, offered, /^Recruit/, 'Choose a recruit', 'Deckhand (deckhand)');
  await offered.getByRole('textbox', { name: /^Weight/ }).fill('3');
  await expect
    .poll(() => stored(page, 'crew', 'records/hall/dock.json'))
    .toEqual({ name: 'Dock', offers: 2, recruits: [{ recruit: 'deckhand', weight: 3 }] });
  await makeCrew(page);
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  const panel = await makeRows(page);
  await expect(panel.getByRole('button', { name: /^1\. row-1/ })).toContainText(
    'When a recruit is hiredDo: add 1 to every bond on the roster',
  );
  await expect(panel.getByRole('button', { name: /^2\. row-2/ })).toContainText(
    'When a member’s rank changesIf the number of members at least veteran is at least 2Do: add 20 credits',
  );
  await expect(panel.getByRole('button', { name: /^3\. row-3/ })).toContainText(
    'When a member leavesDo: recruit deckhand',
  );
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  await showProject(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openProject(page).getByRole('button', { name: 'Export zip' }).click(),
  ]);
  const exported = join(scratch, 'crew.zip');
  await download.saveAs(exported);
  expect(execFileSync('node', ['tools/cli/src/cli.ts', 'validate', exported], { cwd: REPO, encoding: 'utf8' })).toMatch(
    /^11 records: no problems, hash [0-9a-f]{16}\.\n$/,
  );
  expect(errors).toEqual([]);
});

test('the crew’s game runs in the editor with its five kits joined, as eb sim plays it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(fixtureZip(CREW, 'crew'));
  await expect(openProject(page).getByRole('heading', { name: 'The crew' })).toBeVisible();
  await expect(kitsBox(page).getByLabel('Roster', { exact: true })).toBeChecked();
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'Run its scripts' }).click();
  await expect(
    panel.getByText(/^The game: inventory, economy, stats, time, roster, crew, starting in crew/),
  ).toBeVisible();
  await panel.getByLabel('Bot').selectOption('captain');
  await panel.getByRole('button', { name: 'Run 20 games' }).click();
  const report = panel.locator('.logic-report');
  await expect(report).toContainText('crew: 20 runs with the captain policy');
  const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'sim', CREW, '--seeds', '20', '--policy', 'captain'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  expect(`${await report.textContent()}\n`).toBe(cli);
  // The game the scripts made checks the records too: the crew's are clean.
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
