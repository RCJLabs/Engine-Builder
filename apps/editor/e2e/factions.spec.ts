/**
 * M3.5 on desktop: the factions and time kits turned on with Economy, the calendar filled in in
 * the Project panel, a faction with bands and drift and a shop priced by its band made with forms,
 * rows on a season's start and on a shop opening that read a band, change a standing and wait in
 * the calendar's hours, and the export checked clean by `eb` (the gate). Then the steading
 * fixture's game run in the editor with its four kits joined, as `eb sim` plays it.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';
import { createProject, fixtureZip, kitsBox, newRecord, pick, showLogic, stored } from './kitHelpers.ts';
import { openProject, REPO, scratch, showProject } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const STEADING = join(REPO, 'tools/cli/test/fixtures/steading');

/** The calendar filled in: a day of 24 hours, 96 days a year in two seasons, a name fixed on the way. */
async function fillCalendar(page: Page, calendar: Locator): Promise<void> {
  await calendar.getByLabel(/^Ticks a day/).fill('24');
  await calendar.getByLabel('New key for Lengths of time').fill('hours');
  await calendar.getByRole('button', { name: 'Add to Lengths of time' }).click();
  await calendar.getByLabel('Lengths of time: hours', { exact: true }).fill('1');
  await calendar.getByLabel(/^Days a year/).fill('96');
  const seasons = calendar.getByRole('group', { name: 'Seasons (optional)', exact: true });
  await seasons.getByRole('button', { name: 'Add to Seasons' }).click();
  // A name a condition can't write shows why at its box once it is left, as project.json's problem.
  const first = seasons.getByRole('group', { name: 'Seasons, item 1' });
  await first.getByLabel(/^Name/).fill('Spring');
  await first.getByLabel(/^Name/).press('Tab');
  await expect(first.getByText('A name is lowercase words joined by hyphens')).toBeVisible();
  await first.getByLabel(/^Name/).fill('spring');
  await expect(first.getByText('A name is lowercase words joined by hyphens')).toHaveCount(0);
  await seasons.getByRole('button', { name: 'Add to Seasons' }).click();
  const second = seasons.getByRole('group', { name: 'Seasons, item 2' });
  await second.getByLabel(/^Name/).fill('autumn');
  await second.getByLabel(/^Starts on day/).fill('48');
  await expect
    .poll(() => stored(page, 'steading', 'project.json'))
    .toMatchObject({
      calendar: {
        ticksPerDay: 24,
        units: { hours: 1 },
        daysPerYear: 96,
        seasons: [
          { id: 'spring', from: 0 },
          { id: 'autumn', from: 48 },
        ],
      },
    });
}

/** The guild: −50 to 50, hostile below 10 and friendly from it, drifting a point every 4 days. */
async function makeGuild(page: Page): Promise<void> {
  const guild = await newRecord(page, 'faction', 'Faction', 'Guild');
  await guild.getByLabel(/^Lowest/).fill('-50');
  await guild.getByLabel(/^Highest/).fill('50');
  const bands = guild.getByRole('group', { name: 'Bands (optional)', exact: true });
  await bands.getByRole('button', { name: 'Add to Bands' }).click();
  const hostile = bands.getByRole('group', { name: 'Bands, item 1' });
  await hostile.getByLabel(/^Id/).fill('hostile');
  await hostile.getByLabel(/^Prices/).fill('150');
  await bands.getByRole('button', { name: 'Add to Bands' }).click();
  const friendly = bands.getByRole('group', { name: 'Bands, item 2' });
  await friendly.getByLabel(/^Id/).fill('friendly');
  await friendly.getByLabel(/^From/).fill('10');
  await friendly.getByLabel(/^Prices/).fill('80');
  await guild.getByRole('button', { name: 'Add Drift' }).click();
  await guild.getByLabel(/^Every \(days\)/).fill('4');
  await expect
    .poll(() => stored(page, 'steading', 'records/faction/guild.json'))
    .toEqual({
      name: 'Guild',
      min: -50,
      max: 50,
      bands: [
        { id: 'hostile', price: 150 },
        { id: 'friendly', from: 10, price: 80 },
      ],
      drift: { every: 4 },
    });
}

/** A row: its event, an argument the event takes, a condition, then each effect added by its form. */
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

test('the factions and time kits on, a calendar, a faction and a shop priced by its band, rows on its band and the days, the export clean', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await createProject(page, 'Steading');
  await kitsBox(page).getByLabel('Economy', { exact: true }).check();
  await kitsBox(page).getByLabel('Factions', { exact: true }).check();
  // The calendar's form shows once Time is ticked.
  await expect(openProject(page).getByRole('group', { name: 'Calendar' })).toHaveCount(0);
  await kitsBox(page).getByLabel('Time', { exact: true }).check();
  await expect
    .poll(() => stored(page, 'steading', 'project.json'))
    .toMatchObject({ kits: ['inventory', 'economy', 'factions', 'time'] });
  await fillCalendar(page, openProject(page).getByRole('group', { name: 'Calendar' }));
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  await makeGuild(page);
  const silver = await newRecord(page, 'resource', 'Resource', 'Silver');
  await silver.getByLabel(/^Starts at/).fill('200');
  const rope = await newRecord(page, 'item', 'Item', 'Rope');
  await rope.getByLabel(/^Value/).fill('10');
  const post = await newRecord(page, 'shop', 'Shop', 'Post');
  await pick(page, post, /^Currency/, 'Choose a resource', 'Silver (silver)');
  await pick(page, post, /^Faction/, 'Choose a faction', 'Guild (guild)');
  await expect
    .poll(() => stored(page, 'steading', 'records/shop/post.json'))
    .toEqual({ name: 'Post', currency: 'silver', faction: 'guild' });

  // A season's start, offered once the calendar has seasons, read with the guild's band; and a
  // shop opening, which takes hours: Wait's lengths are the calendar's.
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'New sheet' }).click();
  await panel.getByLabel('Name of the new sheet').fill('Seasons');
  await panel.getByRole('button', { name: 'Create' }).click();
  const sheet = page.getByRole('region', { name: 'Trigger sheet seasons' });
  const autumn = await newRow(sheet, 1, 'A season starts');
  await autumn
    .getByRole('group', { name: 'When' })
    .getByLabel(/^Season/)
    .selectOption('autumn');
  await autumn.getByLabel(/^If/).fill('factions.reached(faction: guild, band: friendly)');
  const tithe = autumn.getByRole('group', { name: 'Do' });
  await addEffect(tithe, 'Change a standing');
  await pick(page, tithe, /^Faction Not chosen/, 'Choose a faction', 'Guild (guild)');
  await tithe.getByLabel(/^By/).fill('-5');
  const trading = await newRow(sheet, 2, 'A shop opens');
  const takes = trading.getByRole('group', { name: 'Do' });
  await addEffect(takes, 'Wait');
  await takes.getByLabel(/^Hours/).fill('6');
  await expect
    .poll(() => stored(page, 'steading', 'records/sheet/seasons.json'))
    .toEqual({
      name: 'Seasons',
      rows: [
        {
          id: 'row-1',
          when: { event: 'time/season-started', args: { season: 'autumn' } },
          if: 'factions.reached(faction: guild, band: friendly)',
          do: [{ effect: 'change-standing', faction: 'guild', by: -5 }],
        },
        { id: 'row-2', when: { event: 'economy/opened' }, do: [{ effect: 'wait', hours: 6 }] },
      ],
    });
  await expect(panel.getByRole('button', { name: /^1\. row-1/ })).toContainText(
    'When a season starts (season: autumn)If guild is at least friendlyDo: take 5 from guild’s standing',
  );
  await expect(panel.getByRole('button', { name: /^2\. row-2/ })).toContainText('Do: wait 6 hours');
  // Checked as the export will be: hours are the calendar's, and friendly is one of the guild's bands.
  await sheet.getByLabel(/^Row id/).first().focus();
  await expect(sheet.locator('.field-problem')).toHaveCount(0);
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  await showProject(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openProject(page).getByRole('button', { name: 'Export zip' }).click(),
  ]);
  const exported = join(scratch, 'steading.zip');
  await download.saveAs(exported);
  expect(execFileSync('node', ['tools/cli/src/cli.ts', 'validate', exported], { cwd: REPO, encoding: 'utf8' })).toMatch(
    /^5 records: no problems, hash [0-9a-f]{16}\.\n$/,
  );
  expect(errors).toEqual([]);
});

test('the steading’s game runs in the editor with its four kits and its calendar, as eb sim plays it', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(fixtureZip(STEADING, 'steading'));
  await expect(openProject(page).getByRole('heading', { name: 'The steading' })).toBeVisible();
  await expect(kitsBox(page).getByLabel('Time', { exact: true })).toBeChecked();
  // project.json's calendar in its form: four seasons of 24 days.
  const calendar = openProject(page).getByRole('group', { name: 'Calendar' });
  await expect(calendar.getByRole('group', { name: /^Seasons, item / })).toHaveCount(4);
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'Run its scripts' }).click();
  await expect(
    panel.getByText(/^The game: inventory, economy, factions, time, steading, starting in steading/),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();
  await panel.getByLabel('Bot').selectOption('jarl');
  await panel.getByRole('button', { name: 'Run 20 games' }).click();
  const report = panel.locator('.logic-report');
  await expect(report).toContainText('steading: 20 runs with the jarl policy');
  const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'sim', STEADING, '--seeds', '20', '--policy', 'jarl'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  expect(`${await report.textContent()}\n`).toBe(cli);
  expect(errors).toEqual([]);
});
