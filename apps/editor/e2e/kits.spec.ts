/**
 * M3.3 on desktop: kits turned on in the Project panel, their records made with forms, a row that
 * gives an item, a field of the project's own on a kit's type, and the export checked clean by
 * `eb` (the gate). Then a kit turned off and back, and the hangar fixture's game run in the editor
 * with its kits joined.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';
import { createProject, fixtureZip, kitsBox, newRecord, showLogic, stored } from './kitHelpers.ts';
import { openProject, REPO, scratch, showProject, showRecords } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const HANGAR = join(REPO, 'tools/cli/test/fixtures/hangar');

test('kits turned on, their records made with forms, a row giving an item, and the export clean for eb', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await createProject(page, 'Market');
  // Economy needs Inventory: ticking it ticks both, as one step.
  await kitsBox(page).getByLabel('Economy', { exact: true }).check();
  await expect(kitsBox(page).getByLabel('Inventory', { exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Undo: Turn on the economy kit, with inventory' })).toBeVisible();
  await expect.poll(() => stored(page, 'market', 'project.json')).toMatchObject({ kits: ['inventory', 'economy'] });
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  // The kits' types in Records, each record made and filled in with its form.
  await showRecords(page);
  await expect(page.getByLabel('Type', { exact: true }).locator('option')).toHaveText([
    'Item (0)',
    'Loot table (0)',
    'Resource (0)',
    'Shop (0)',
    // The engine's audio types follow a project's own (M4.8).
    'Sound (0)',
    'Ambience (0)',
    'Music (0)',
    'Environment (0)',
    'Material (0)',
    'Model (0)',
    'Foliage (0)',
  ]);
  const medkit = await newRecord(page, 'item', 'Item', 'Medkit');
  await medkit.getByLabel(/^Value/).fill('30');
  await expect.poll(() => stored(page, 'market', 'records/item/medkit.json')).toEqual({ name: 'Medkit', value: 30 });
  const credits = await newRecord(page, 'resource', 'Resource', 'Credits');
  await credits.getByLabel(/^Starts at/).fill('50');
  await credits.getByLabel(/^Price step/).fill('5');
  await expect
    .poll(() => stored(page, 'market', 'records/resource/credits.json'))
    .toEqual({ name: 'Credits', start: 50, step: 5 });
  const shop = await newRecord(page, 'shop', 'Shop', 'Dutch');
  await shop.getByRole('button', { name: /^Currency/ }).click();
  await page
    .getByRole('dialog', { name: 'Choose a resource' })
    .getByRole('option', { name: 'Credits (credits)' })
    .click();
  await expect
    .poll(() => stored(page, 'market', 'records/shop/dutch.json'))
    .toEqual({ name: 'Dutch', currency: 'credits' });

  // A row on a kit's event, doing a kit's effect, its form drawn from the effect's fields.
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'New sheet' }).click();
  await panel.getByLabel('Name of the new sheet').fill('Gifts');
  await panel.getByRole('button', { name: 'Create' }).click();
  const sheet = page.getByRole('region', { name: 'Trigger sheet gifts' });
  await sheet.getByRole('button', { name: 'Add a row' }).click();
  const row = sheet.getByRole('group', { name: 'Row 1: row-1' });
  await row
    .getByRole('group', { name: 'When' })
    .getByLabel('Event', { exact: true })
    .selectOption({ label: 'A shop opens' });
  const does = row.getByRole('group', { name: 'Do' });
  await does.getByLabel('Effect to add to Do').selectOption({ label: 'Give an item' });
  await does.getByRole('button', { name: 'Add effect to Do' }).click();
  await does.getByRole('button', { name: /^Item/ }).click();
  await page.getByRole('dialog', { name: 'Choose an item' }).getByRole('option', { name: 'Medkit (medkit)' }).click();
  await expect
    .poll(() => stored(page, 'market', 'records/sheet/gifts.json'))
    .toEqual({
      name: 'Gifts',
      rows: [{ id: 'row-1', when: { event: 'economy/opened' }, do: [{ effect: 'give-item', item: 'medkit' }] }],
    });
  await expect(panel.getByRole('button', { name: /^1\. row-1/ })).toContainText('When a shop opensDo: give medkit');

  // The kit's item: its fields shown and kept, a field of the project's own added after them.
  await showRecords(page);
  await page.getByLabel('Type', { exact: true }).selectOption('item');
  await page.getByRole('button', { name: 'Edit type' }).click();
  const design = page.getByRole('region', { name: 'Type Item' });
  await expect(design.getByRole('region', { name: 'The inventory kit’s fields' })).toContainText('Most carried');
  await expect(design.getByRole('button', { name: 'Rename' })).toHaveCount(0);
  await design.getByRole('button', { name: 'Add fields of your own' }).click();
  // With a file of its own, still the kit's to name: no Rename or Delete.
  await expect(design.getByRole('button', { name: 'Add a field' }).last()).toBeVisible();
  await expect(design.getByRole('button', { name: 'Rename' })).toHaveCount(0);
  await expect(design.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await design.getByRole('button', { name: 'Add a field' }).last().click();
  const add = design.getByRole('form', { name: 'New field' });
  await add.getByLabel('Name of the new field').fill('maker');
  await add.getByLabel('Kind', { exact: true }).selectOption({ label: 'Text' });
  await add.getByRole('button', { name: 'Add field' }).click();
  await expect
    .poll(() => stored(page, 'market', 'types/item.json'))
    .toMatchObject({ title: 'Item', fields: { maker: { kind: 'text' } } });
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  await showProject(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openProject(page).getByRole('button', { name: 'Export zip' }).click(),
  ]);
  const exported = join(scratch, 'market.zip');
  await download.saveAs(exported);
  expect(execFileSync('node', ['tools/cli/src/cli.ts', 'validate', exported], { cwd: REPO, encoding: 'utf8' })).toMatch(
    /^4 records: no problems, hash [0-9a-f]{16}\.\n$/,
  );
  expect(errors).toEqual([]);
});

test('two kits ticked in one moment both stay on', async ({ page }) => {
  await createProject(page, 'Pair');
  await expect(kitsBox(page).getByLabel('Time', { exact: true })).toBeEnabled();
  // Both in one task, before the first tick's edit lands and the boxes are drawn again: each tick
  // worked out its kits from the boxes as drawn, so the second undid the first (M3.8, seen on CI
  // with Dialogue then Economy).
  await page.evaluate(() => {
    for (const id of ['kit-dialogue', 'kit-time']) (document.getElementById(id) as HTMLInputElement).click();
  });
  await expect.poll(() => stored(page, 'pair', 'project.json')).toMatchObject({ kits: ['time', 'dialogue'] });
  await expect(kitsBox(page).getByLabel('Dialogue', { exact: true })).toBeChecked();
  await expect(kitsBox(page).getByLabel('Time', { exact: true })).toBeChecked();
});

test('a box ticked as a new project opens stays ticked while its first read lands', async ({ page }) => {
  await createProject(page, 'Opening');
  // A slow machine, so the new project's first read is still going when the box is ticked: it
  // landed after the tick and drew the kits as they were, unticking the box until the edit landed
  // (M4.10, seen on a busy machine; 2 runs in 3 at this rate before the boxes kept what was asked).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  // Watched from the page every frame, from before the tick, as Playwright's own checks look only once.
  await page.evaluate(() => {
    const box = document.getElementById('kit-roster') as HTMLInputElement;
    const seen: boolean[] = [box.checked];
    Object.assign(window, { seenRoster: seen });
    const look = () => {
      if (seen.at(-1) !== box.checked) seen.push(box.checked);
      if (seen.length < 10) requestAnimationFrame(look);
    };
    box.addEventListener('change', () => seen.push(box.checked));
    requestAnimationFrame(look);
  });
  await kitsBox(page).getByLabel('Roster', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo: Turn on the roster kit, with stats' })).toBeVisible();
  await expect.poll(() => stored(page, 'opening', 'project.json')).toMatchObject({ kits: ['stats', 'roster'] });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await expect(kitsBox(page).getByLabel('Roster', { exact: true })).toBeChecked();
  expect(await page.evaluate(() => (window as unknown as { seenRoster: boolean[] }).seenRoster)).toEqual([false, true]);
});

test('a kit turned off takes its types with it, and undo brings them back', async ({ page }) => {
  const errors = watchErrors(page);
  await createProject(page, 'Stall');
  await kitsBox(page).getByLabel('Economy', { exact: true }).check();
  await newRecord(page, 'item', 'Item', 'Rope');
  await showProject(page);
  // Inventory off takes Economy with it, which needs it.
  await kitsBox(page).getByLabel('Inventory', { exact: true }).uncheck();
  await expect(kitsBox(page).getByLabel('Economy', { exact: true })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Undo: Turn off the inventory kit, with economy' })).toBeVisible();
  await expect.poll(() => stored(page, 'stall', 'project.json')).not.toHaveProperty('kits');
  // The rope is now of a type the project doesn't have.
  await expect(page.getByRole('tab', { name: 'Problems (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo: Turn off the inventory kit, with economy' }).click();
  await expect(kitsBox(page).getByLabel('Economy', { exact: true })).toBeChecked();
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the hangar’s game runs in the editor with its kits joined, as eb sim plays it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(fixtureZip(HANGAR, 'hangar'));
  await expect(openProject(page).getByRole('heading', { name: 'The hangar' })).toBeVisible();
  await expect(kitsBox(page).getByLabel('Inventory', { exact: true })).toBeChecked();
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'Run its scripts' }).click();
  // The kits' modules are the game's too, joined before its own.
  await expect(panel.getByText(/^The game: inventory, economy, time, hangar, starting in hangar/)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();
  await panel.getByLabel('Bot').selectOption('worker');
  await panel.getByRole('button', { name: 'Run 20 games' }).click();
  const report = panel.locator('.logic-report');
  await expect(report).toContainText('hangar: 20 runs with the worker policy');
  const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'sim', HANGAR, '--seeds', '20', '--policy', 'worker'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  expect(`${await report.textContent()}\n`).toBe(cli);
  // project.json is the game's too: a kit turned off runs the game again without it.
  await showProject(page);
  await kitsBox(page).getByLabel('Economy', { exact: true }).uncheck();
  await showLogic(page);
  await expect(panel.getByText(/^The game: inventory, time, hangar, starting in hangar/)).toBeVisible();
  expect(errors).toEqual([]);
});
