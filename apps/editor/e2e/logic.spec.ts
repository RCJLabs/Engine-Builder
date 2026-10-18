/**
 * M3.1 on desktop: flags and a trigger sheet made in the Logic panel, the flag lint following each
 * edit, a game's own event and effect kept as written and edited as JSON (D36), and the export
 * read by the CLI with no --types module to the hash of the same files made in Node.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { compileProject, memorySource } from '@eb/compiler';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { readFixture } from '../../../packages/compiler/test/fixture.ts';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';
import { importLudus, LUDUS, openProject, REPO, scratch, showProject, stored } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 900 } });

async function showLogic(page: Page): Promise<Locator> {
  await page.getByRole('tab', { name: 'Logic' }).click();
  const panel = page.locator('[data-panel="logic"]');
  await expect(panel.getByRole('heading', { name: 'Trigger sheets' })).toBeVisible();
  return panel;
}

async function create(panel: Locator, what: 'sheet' | 'flag', name: string): Promise<void> {
  await panel.getByRole('button', { name: `New ${what}` }).click();
  await panel.getByLabel(`Name of the new ${what}`).fill(name);
  await panel.getByRole('button', { name: 'Create' }).click();
}

const card = (panel: Locator, name: RegExp) => panel.getByRole('button', { name });

test('flags and a sheet made in the Logic panel, the lint following each edit, exported and read by the CLI', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await importLudus(page);
  const panel = await showLogic(page);
  await expect(panel.getByText('No sheets yet.')).toBeVisible();
  await expect(panel.getByText('No flags yet.')).toBeVisible();

  await create(panel, 'flag', 'Met the trader');
  await expect(page.getByRole('region', { name: 'Flag met-the-trader' })).toBeVisible();
  await expect(card(panel, /^Met the trader \(met-the-trader\)/)).toContainText('Nothing sets or reads this flag');
  await create(panel, 'flag', 'Raids');
  const raids = page.getByRole('region', { name: 'Flag raids' });
  await raids.getByRole('button', { name: 'Add Number' }).click();
  await raids.getByLabel('Highest').fill('5');
  await expect.poll(() => stored(page, 'records/flag/raids.json')).toEqual({ name: 'Raids', number: { max: 5 } });

  await create(panel, 'sheet', 'The arena');
  const sheet = page.getByRole('region', { name: 'Trigger sheet the-arena' });
  await sheet.getByRole('button', { name: 'Add a row' }).click();
  const first = sheet.getByRole('group', { name: 'Row 1: row-1' });
  await first.getByRole('group', { name: 'When' }).getByLabel(/^Flag/).selectOption('raids');
  await first.getByLabel(/^If/).fill('flag.number(raids) >= 3');
  const firstDo = first.getByRole('group', { name: 'Do' });
  await firstDo.getByRole('button', { name: 'Add effect to Do' }).click();
  await firstDo.getByLabel('Flag', { exact: true }).selectOption('met-the-trader');
  await first.getByLabel(/^Once/).check();
  await expect
    .poll(() => stored(page, 'records/sheet/the-arena.json'))
    .toEqual({
      name: 'The arena',
      rows: [
        {
          id: 'row-1',
          when: { event: 'flag/changed', args: { flag: 'raids' } },
          if: 'flag.number(raids) >= 3',
          do: [{ effect: 'set-flag', flag: 'met-the-trader', to: true }],
          once: true,
        },
      ],
    });
  // Set and never read, read and never set: the lint says so on each flag, and Problems counts them.
  await expect(card(panel, /^Met the trader/)).toContainText(
    "Set by sheet:the-arena, but no condition or row's When reads it",
  );
  await expect(card(panel, /^Raids/)).toContainText('Read by sheet:the-arena, but nothing sets it: it always holds 0');
  await expect(card(panel, /^1\. row-1 · once/)).toContainText('If raids is at least 3');
  await expect(page.getByRole('tab', { name: 'Problems (2)' })).toBeVisible();

  // A second row that reads the first flag and sets the second: the warnings go.
  await sheet.getByRole('button', { name: 'Add a row' }).click();
  const second = sheet.getByRole('group', { name: 'Row 2: row-2' });
  const when = second.getByRole('group', { name: 'When' });
  await when.getByLabel('Event', { exact: true }).selectOption({ label: 'A row runs' });
  await when.getByLabel(/^Sheet/).selectOption('the-arena');
  await when.getByLabel(/^Row/).fill('row-1');
  await second.getByLabel(/^If/).fill('flag.on(met-the-trader)');
  const secondDo = second.getByRole('group', { name: 'Do' });
  await secondDo.getByLabel('Effect to add to Do').selectOption({ label: 'Add to a flag' });
  await secondDo.getByRole('button', { name: 'Add effect to Do' }).click();
  await secondDo.getByLabel('Flag', { exact: true }).selectOption('raids');
  await secondDo.getByLabel('By').fill('-1');
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();
  await expect(card(panel, /^2\. row-2/)).toContainText('When a row runs (sheet: the-arena, row: row-1)');
  await expect(card(panel, /^2\. row-2/)).toContainText('Do: take 1 from raids');
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  await showProject(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openProject(page).getByRole('button', { name: 'Export zip' }).click(),
  ]);
  const exported = join(scratch, 'ludus-logic.zip');
  await download.saveAs(exported);
  const files = readFixture(LUDUS);
  files['records/flag/met-the-trader.json'] = JSON.stringify({ name: 'Met the trader' });
  files['records/flag/raids.json'] = JSON.stringify({ name: 'Raids', number: { max: 5 } });
  files['records/sheet/the-arena.json'] = JSON.stringify({
    name: 'The arena',
    rows: [
      {
        id: 'row-1',
        when: { event: 'flag/changed', args: { flag: 'raids' } },
        if: 'flag.number(raids) >= 3',
        do: [{ effect: 'set-flag', flag: 'met-the-trader', to: true }],
        once: true,
      },
      {
        id: 'row-2',
        when: { event: 'sheet/fired', args: { sheet: 'the-arena', row: 'row-1' } },
        if: 'flag.on(met-the-trader)',
        do: [{ effect: 'add-to-flag', flag: 'raids', by: -1 }],
      },
    ],
  });
  const expected = await compileProject(memorySource(files), []);
  expect(expected.diagnostics).toEqual([]);
  const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'validate', exported], { cwd: REPO, encoding: 'utf8' });
  expect(cli).toBe(`11 records: no problems, hash ${expected.pack?.hash}.\n`);
  expect(errors).toEqual([]);
});

test('a game’s own event and effect are kept as written, and edited as JSON', async ({ page }) => {
  const errors = watchErrors(page);
  const own = {
    rows: [
      {
        id: 'roar',
        when: { event: 'arena/opened', args: { day: 3 } },
        do: [{ effect: 'crowd', mood: 'wild' }],
      },
    ],
  };
  await importLudus(page, { 'records/sheet/games.json': JSON.stringify(own) });
  const panel = await showLogic(page);
  await expect(card(panel, /^1\. roar/)).toContainText('When arena/opened (day: 3)');
  await card(panel, /^1\. roar/).click();
  const sheet = page.getByRole('region', { name: 'Trigger sheet games' });
  const when = sheet.getByRole('group', { name: 'When' });
  // Opened at the row, focus in its first field.
  await expect(when.getByLabel('Event', { exact: true })).toBeFocused();
  await expect(when.getByLabel('Event', { exact: true })).toHaveValue('');
  await expect(when.getByLabel('Event id')).toHaveValue('arena/opened');
  await expect(when.getByLabel(/^With these arguments/)).toHaveValue(JSON.stringify({ day: 3 }, null, 2));
  const effect = sheet.getByRole('group', { name: 'Do' }).getByRole('textbox', { name: 'Effect' });
  await expect(effect).toHaveValue(JSON.stringify({ effect: 'crowd', mood: 'wild' }, null, 2));

  // Text that isn't JSON yet stays in the box, with why, and the file waits for it.
  await effect.fill('{ "effect": "crowd", "mood": ');
  // Said once the box is left, as every field's problems are.
  await effect.blur();
  await expect(sheet.getByText(/^Not JSON yet/)).toBeVisible();
  await expect(effect).toHaveValue('{ "effect": "crowd", "mood": ');
  expect(await stored(page, 'records/sheet/games.json')).toEqual(own);
  await effect.fill('{ "effect": "crowd", "mood": "calm" }');
  await expect
    .poll(() => stored(page, 'records/sheet/games.json'))
    .toEqual({ rows: [{ ...own.rows[0], do: [{ effect: 'crowd', mood: 'calm' }] }] });
  // No --types: a game's names are taken as written, so nothing here is a problem.
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a problem inside a row opens the sheet at its field', async ({ page }) => {
  const errors = watchErrors(page);
  const sheet = {
    rows: [{ id: 'a', when: { event: 'flag/changed' }, do: [{ effect: 'set-flag', flag: 'ghost', to: true }] }],
  };
  await importLudus(page, { 'records/sheet/s.json': JSON.stringify(sheet) });
  await page.getByRole('tab', { name: /^Problems/ }).click();
  const problems = page.locator('[data-panel="problems"]');
  await problems.getByRole('button', { name: /E005 No record flag:ghost · Rows, item 1: Do, item 1: flag$/ }).click();
  const form = page.getByRole('region', { name: 'Trigger sheet s' });
  await expect(form.getByRole('group', { name: 'Do' }).getByLabel('Flag', { exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});
