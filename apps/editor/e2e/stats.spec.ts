/**
 * M3.4 on desktop: the stats and gear kits turned on, a stat, a slot, an item, a status and an
 * actor made with forms, the actor wearing the item, a row that hurts and adds a status, and the
 * export checked clean by `eb` (the gate). Then the arena fixture's game run in the editor with
 * its four kits joined, as `eb sim` plays it.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';
import { createProject, fixtureZip, kitsBox, newRecord, pick, showLogic, stored } from './kitHelpers.ts';
import { openProject, REPO, scratch, showProject } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const ARENA = join(REPO, 'tools/cli/test/fixtures/arena');

test('the stats and gear kits on, their records made with forms, gear worn, a row that hurts, the export clean', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await createProject(page, 'Barracks');
  // Gear needs Stats and Inventory: ticking it ticks all three, as one step.
  await kitsBox(page).getByLabel('Gear', { exact: true }).check();
  await expect(kitsBox(page).getByLabel('Stats', { exact: true })).toBeChecked();
  await expect(kitsBox(page).getByLabel('Inventory', { exact: true })).toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Undo: Turn on the gear kit, with inventory and stats' }),
  ).toBeVisible();
  await expect
    .poll(() => stored(page, 'barracks', 'project.json'))
    .toMatchObject({ kits: ['inventory', 'stats', 'gear'] });

  const health = await newRecord(page, 'stat', 'Stat', 'Health');
  await health.getByLabel(/^Highest/).fill('100');
  await health.getByLabel(/^Starts at/).fill('10');
  await newRecord(page, 'slot', 'Slot', 'Hand');
  const rifle = await newRecord(page, 'item', 'Item', 'Rifle');
  await pick(page, rifle, /^Worn in/, 'Choose a slot', 'Hand (hand)');
  await newRecord(page, 'status', 'Status', 'Bleeding');
  const ana = await newRecord(page, 'actor', 'Actor', 'Ana');
  await ana.getByRole('button', { name: 'Add to Stats' }).click();
  await page.getByRole('dialog', { name: 'Add to Stats' }).getByRole('option', { name: 'Health (health)' }).click();
  await ana.getByLabel('Stats: health', { exact: true }).fill('12');
  await ana.getByRole('button', { name: 'Add to Wears' }).click();
  await page.getByRole('dialog', { name: 'Add to Wears' }).getByRole('option', { name: 'Hand (hand)' }).click();
  await pick(page, ana, /^Wears: hand Not chosen/, 'Choose an item', 'Rifle (rifle)');
  await expect
    .poll(() => stored(page, 'barracks', 'records/actor/ana.json'))
    .toEqual({ name: 'Ana', stats: { health: 12 }, wears: { hand: 'rifle' } });
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();

  // A row on a stat running out, that hurts again and adds a status, each form drawn from its fields.
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'New sheet' }).click();
  await panel.getByLabel('Name of the new sheet').fill('Wounds');
  await panel.getByRole('button', { name: 'Create' }).click();
  const sheet = page.getByRole('region', { name: 'Trigger sheet wounds' });
  await sheet.getByRole('button', { name: 'Add a row' }).click();
  const row = sheet.getByRole('group', { name: 'Row 1: row-1' });
  await row
    .getByRole('group', { name: 'When' })
    .getByLabel('Event', { exact: true })
    .selectOption({ label: 'A stat runs out' });
  const does = row.getByRole('group', { name: 'Do' });
  await does.getByLabel('Effect to add to Do').selectOption({ label: 'Damage a stat' });
  await does.getByRole('button', { name: 'Add effect to Do' }).click();
  // Each pick takes the one field still not chosen: the effects' blocks are in one list.
  await pick(page, does, /^Actor Not chosen/, 'Choose an actor', 'Ana (ana)');
  await pick(page, does, /^Stat Not chosen/, 'Choose a stat', 'Health (health)');
  await does.getByLabel(/^By/).fill('3');
  await does.getByLabel('Effect to add to Do').selectOption({ label: 'Add a status' });
  await does.getByRole('button', { name: 'Add effect to Do' }).click();
  await pick(page, does, /^Actor Not chosen/, 'Choose an actor', 'Ana (ana)');
  await pick(page, does, /^Status Not chosen/, 'Choose a status', 'Bleeding (bleeding)');
  await expect
    .poll(() => stored(page, 'barracks', 'records/sheet/wounds.json'))
    .toEqual({
      name: 'Wounds',
      rows: [
        {
          id: 'row-1',
          when: { event: 'stats/emptied' },
          do: [
            { effect: 'damage-stat', actor: 'ana', stat: 'health', by: 3 },
            { effect: 'add-status', actor: 'ana', status: 'bleeding' },
          ],
        },
      ],
    });
  await expect(panel.getByRole('button', { name: /^1\. row-1/ })).toContainText(
    'When a stat runs outDo: damage ana’s health by 3, then add bleeding to ana',
  );
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  await showProject(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openProject(page).getByRole('button', { name: 'Export zip' }).click(),
  ]);
  const exported = join(scratch, 'barracks.zip');
  await download.saveAs(exported);
  expect(execFileSync('node', ['tools/cli/src/cli.ts', 'validate', exported], { cwd: REPO, encoding: 'utf8' })).toMatch(
    /^6 records: no problems, hash [0-9a-f]{16}\.\n$/,
  );
  expect(errors).toEqual([]);
});

test('the arena’s game runs in the editor with its four kits joined, as eb sim plays it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(fixtureZip(ARENA, 'arena'));
  await expect(openProject(page).getByRole('heading', { name: 'The arena' })).toBeVisible();
  await expect(kitsBox(page).getByLabel('Gear', { exact: true })).toBeChecked();
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'Run its scripts' }).click();
  await expect(
    panel.getByText(/^The game: inventory, economy, stats, gear, time, arena, starting in arena/),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();
  await panel.getByLabel('Bot').selectOption('lanista');
  await panel.getByRole('button', { name: 'Run 20 games' }).click();
  const report = panel.locator('.logic-report');
  await expect(report).toContainText('arena: 20 runs with the lanista policy');
  const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'sim', ARENA, '--seeds', '20', '--policy', 'lanista'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  expect(`${await report.textContent()}\n`).toBe(cli);
  expect(errors).toEqual([]);
});
