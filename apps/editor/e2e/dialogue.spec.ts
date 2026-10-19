/**
 * M3.8 on desktop: the dialogue kit turned on beside Economy; a resource and two speakers; a talk
 * made with forms, its opening line with an option that costs, one that rolls two outcomes whose
 * chances don't add up until they are fixed, and a goodbye; a line nothing leads to until the
 * goodbye does; the map's rows as the talk grows, and a box tapped to open its line; a row opening
 * the talk, whose condition names a line the talk lacks until it is fixed; and the export checked
 * clean by `eb` (the gate). Then the crag fixture's game run in the editor with its three kits
 * joined, as `eb sim` plays it.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';
import { createProject, fixtureZip, kitsBox, newRecord, pick, showLogic, stored } from './kitHelpers.ts';
import { openProject, REPO, scratch, showProject } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const CRAG = join(REPO, 'tools/cli/test/fixtures/crag');

/** An item added to a list in `scope`, as its group. */
async function addTo(scope: Locator, list: string, n: number): Promise<Locator> {
  await scope.getByRole('button', { name: `Add to ${list}`, exact: true }).click();
  const item = scope.getByRole('group', { name: `${list}, item ${n}`, exact: true });
  await expect(item).toBeVisible();
  return item;
}

/** A line added to the talk, with its id and text: filled before its options, whose ids it would share a label with. */
async function addLine(talk: Locator, n: number, id: string, text: string): Promise<Locator> {
  const line = await addTo(talk, 'Lines', n);
  await line.getByLabel('Id', { exact: true }).fill(id);
  await line.getByLabel(/^Text/).fill(text);
  return line;
}

async function addOption(line: Locator, n: number, id: string, label: string): Promise<Locator> {
  const option = await addTo(line, 'Options', n);
  await option.getByLabel('Id', { exact: true }).fill(id);
  await option.getByLabel('Label', { exact: true }).fill(label);
  return option;
}

/** The map's row under `title`. The heading it has is found within each row, so it starts from the page. */
function mapRow(talk: Locator, title: string): Locator {
  const map = talk.getByRole('region', { name: 'Map of the talk' });
  return map.locator('.talk-map-row', { has: talk.page().getByRole('heading', { name: title, exact: true }) });
}

/** Hello: gas money that costs, a send at 60 to 40 (30 until fixed), and a goodbye. */
async function makeHello(page: Page, talk: Locator): Promise<void> {
  const hello = await addLine(talk, 1, 'hello', 'First time at the crag?');
  const gas = await addOption(hello, 1, 'gas', 'Chip in for gas');
  await gas.getByRole('button', { name: 'Add to Cost' }).click();
  await page.getByRole('dialog', { name: 'Add to Cost' }).getByRole('option', { name: 'Cash (cash)' }).click();
  await gas.getByLabel('Cost: cash', { exact: true }).fill('10');
  await gas.getByLabel(/^Leads to/).fill('thanks');
  const send = await addOption(hello, 2, 'send', 'Watch me send it');
  const sent = await addTo(send, 'Outcomes', 1);
  const fell = await addTo(send, 'Outcomes', 2);
  await sent.getByRole('textbox', { name: /^Chance/ }).fill('60');
  await sent.getByLabel(/^Leads to/).fill('sent');
  await fell.getByRole('textbox', { name: /^Chance/ }).fill('30');
  await fell.getByRole('textbox', { name: /^Chance/ }).press('Tab');
  // Chances that don't add up show why at the outcomes' box, as the compiler's E035, and go once fixed.
  const short = send.getByText('Its chances add up to 90: they add up to 100');
  await expect(short).toBeVisible();
  await fell.getByRole('textbox', { name: /^Chance/ }).fill('40');
  await expect(short).toHaveCount(0);
  await addOption(hello, 3, 'bye', 'See you around.');
}

/** Marge's talk, made with forms, its map read as it grows. */
async function makeTalk(page: Page): Promise<Locator> {
  const talk = await newRecord(page, 'talk', 'Talk', 'Marge');
  await pick(page, talk, /^Speaker/, 'Choose a speaker', 'Marge (marge)');
  const start = await addTo(talk, 'Starts', 1);
  await start.getByLabel(/^Line/).fill('hello');
  await makeHello(page, talk);
  // Whole, it is warned that nothing opens it yet (W123), at the top of its form.
  const unopened = talk.getByText('No row, choice, line, consequence or outcome opens it with Open a talk');
  await expect(unopened).toBeVisible();
  const thanks = await addLine(talk, 2, 'thanks', 'Appreciated. Next round is on me.');
  await thanks.getByLabel(/^Then/).fill('hello');
  const sent = await addLine(talk, 3, 'sent', 'Clean!');
  await pick(page, sent, /^Speaker/, 'Choose a speaker', 'Dex (dex)');
  await addLine(talk, 4, 'later', 'See you at the crag.');
  // Nothing leads to "later" (W121): at its id, and in the map's last row.
  const never = talk.getByText('No start leads here, by an option, an outcome or a Then: it is never shown');
  await expect(never).toBeVisible();
  await expect(mapRow(talk, 'Nothing leads here').getByRole('button')).toHaveCount(1);
  await expect(mapRow(talk, 'Nothing leads here').getByRole('button')).toContainText('See you at the crag.');
  await talk
    .getByRole('group', { name: 'Options, item 3', exact: true })
    .getByLabel(/^Leads to/)
    .fill('later');
  await expect(never).toHaveCount(0);
  await expect(mapRow(talk, 'Nothing leads here')).toHaveCount(0);
  await expect(mapRow(talk, 'Opens at').getByRole('button')).toHaveText([/^hello/]);
  await expect(mapRow(talk, '1 step on').getByRole('button')).toHaveText([/^thanks/, /^sent · Dex/, /^later/]);
  await expect(mapRow(talk, 'Opens at').getByRole('button')).toContainText(
    '“Chip in for gas” → thanks“Watch me send it”, 60% → sent“Watch me send it”, 40% → the end of the talk' +
      '“See you around.” → later',
  );
  // A box tapped opens its line's form at its text.
  await mapRow(talk, '1 step on').getByRole('button', { name: /^sent/ }).click();
  await expect(talk.getByRole('group', { name: 'Lines, item 3', exact: true }).getByLabel(/^Text/)).toBeFocused();
  await expect
    .poll(() => stored(page, 'crag', 'records/talk/marge.json'))
    .toEqual({
      name: 'Marge',
      speaker: 'marge',
      starts: [{ line: 'hello' }],
      lines: [
        {
          id: 'hello',
          text: 'First time at the crag?',
          options: [
            { id: 'gas', label: 'Chip in for gas', cost: { cash: 10 }, next: 'thanks' },
            {
              id: 'send',
              label: 'Watch me send it',
              outcomes: [
                { chance: 60, effects: [], next: 'sent' },
                { chance: 40, effects: [] },
              ],
            },
            { id: 'bye', label: 'See you around.', next: 'later' },
          ],
        },
        { id: 'thanks', text: 'Appreciated. Next round is on me.', next: 'hello' },
        { id: 'sent', text: 'Clean!', speaker: 'dex' },
        { id: 'later', text: 'See you at the crag.' },
      ],
    });
  await expect(unopened).toBeVisible();
  return talk;
}

/** A row opening the talk as one ends, once the send has been heard: a line the talk lacks is E042 until fixed. */
async function makeRow(page: Page): Promise<Locator> {
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'New sheet' }).click();
  await panel.getByLabel('Name of the new sheet').fill('Crag');
  await panel.getByRole('button', { name: 'Create' }).click();
  const sheet = page.getByRole('region', { name: 'Trigger sheet crag' });
  await sheet.getByRole('button', { name: 'Add a row' }).click();
  const row = sheet.getByRole('group', { name: 'Row 1: row-1' });
  await row
    .getByRole('group', { name: 'When' })
    .getByLabel('Event', { exact: true })
    .selectOption({ label: 'A talk ends' });
  await row.getByLabel(/^If/).fill('dialogue.heard(talk: marge, line: top) >= 1');
  await row.getByLabel(/^If/).press('Tab');
  const top = row.getByText('The talk marge has no line top: its lines are hello, thanks, sent, later');
  await expect(top).toBeVisible();
  await row.getByLabel(/^If/).fill('dialogue.heard(talk: marge, line: sent) >= 1');
  await row.getByLabel(/^If/).press('Tab');
  await expect(top).toHaveCount(0);
  const opens = row.getByRole('group', { name: 'Do' });
  await opens.getByLabel('Effect to add to Do', { exact: true }).selectOption({ label: 'Open a talk' });
  await opens.getByRole('button', { name: 'Add effect to Do', exact: true }).click();
  await pick(page, opens, /^Talk Not chosen/, 'Choose a talk', 'Marge (marge)');
  await expect
    .poll(() => stored(page, 'crag', 'records/sheet/crag.json'))
    .toEqual({
      name: 'Crag',
      rows: [
        {
          id: 'row-1',
          when: { event: 'dialogue/ended' },
          if: 'dialogue.heard(talk: marge, line: sent) >= 1',
          do: [{ effect: 'open-talk', talk: 'marge' }],
        },
      ],
    });
  return panel;
}

test('the dialogue kit on, a talk made with forms and seen on its map, a row opening it, the export clean', async ({
  page,
}) => {
  // Four records, a talk of four lines and a row made by hand, each checked as it lands.
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await createProject(page, 'Crag');
  await kitsBox(page).getByLabel('Dialogue', { exact: true }).check();
  await kitsBox(page).getByLabel('Economy', { exact: true }).check();
  await expect
    .poll(() => stored(page, 'crag', 'project.json'))
    .toMatchObject({ kits: ['inventory', 'economy', 'dialogue'] });
  await expectNothingOffscreen(page);

  const cash = await newRecord(page, 'resource', 'Resource', 'Cash');
  await cash.getByLabel(/^Starts at/).fill('20');
  await newRecord(page, 'speaker', 'Speaker', 'Marge');
  await newRecord(page, 'speaker', 'Speaker', 'Dex');
  await makeTalk(page);
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  const panel = await makeRow(page);
  await expect(panel.getByRole('button', { name: /^1\. row-1/ })).toContainText(
    'When a talk endsIf the times sent has been heard in marge is at least 1Do: open the talk marge',
  );
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  await showProject(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openProject(page).getByRole('button', { name: 'Export zip' }).click(),
  ]);
  const exported = join(scratch, 'crag.zip');
  await download.saveAs(exported);
  expect(execFileSync('node', ['tools/cli/src/cli.ts', 'validate', exported], { cwd: REPO, encoding: 'utf8' })).toMatch(
    /^5 records: no problems, hash [0-9a-f]{16}\.\n$/,
  );
  expect(errors).toEqual([]);
});

test('the crag’s game runs in the editor with its three kits joined, as eb sim plays it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(fixtureZip(CRAG, 'crag'));
  await expect(openProject(page).getByRole('heading', { name: 'The crag' })).toBeVisible();
  await expect(kitsBox(page).getByLabel('Dialogue', { exact: true })).toBeChecked();
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'Run its scripts' }).click();
  await expect(panel.getByText(/^The game: inventory, economy, dialogue, crag, starting in town/)).toBeVisible();
  await panel.getByLabel('Bot').selectOption('climber');
  await panel.getByRole('button', { name: 'Run 20 games' }).click();
  const report = panel.locator('.logic-report');
  await expect(report).toContainText('crag: 20 runs with the climber policy');
  const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'sim', CRAG, '--seeds', '20', '--policy', 'climber'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  expect(`${await report.textContent()}\n`).toBe(cli);
  expect(errors).toEqual([]);
});
