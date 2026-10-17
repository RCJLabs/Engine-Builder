/** M2.5's Records panel on a desktop: the table, its search, filters and sort, bulk edits, copies and "used by". */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { importLudus, openProject, openRecord, recordLink, SPICULUS, showTable, stored } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 800 } });

/** The ids of the table's rows, in order. */
const ids = (table: Locator) => table.locator('tbody .record-id').allTextContents();
const PRISCUS = 'records/gladiator/priscus.json';

/** The record ids the table shows, once they read `expected`. */
async function expectRows(table: Locator, expected: string[]): Promise<void> {
  await expect.poll(() => ids(table)).toEqual(expected);
}

const count = (page: Page) => page.locator('.table-count');

test('sorts by any column, searches every cell, and filters by field', async ({ page }) => {
  const errors = watchErrors(page);
  await importLudus(page);
  const table = await showTable(page, 'Gladiator');
  await expectRows(table, ['flamma', 'priscus', 'spiculus']);
  await expect(table.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'ascending');
  await expect(count(page)).toHaveText('3 records');

  await table.getByRole('button', { name: 'Might' }).click();
  await expectRows(table, ['priscus', 'spiculus', 'flamma']);
  await expect(table.getByRole('columnheader', { name: 'Might' })).toHaveAttribute('aria-sort', 'ascending');
  // aria-sort sits on the sorted column only (APG).
  await expect(table.locator('th[aria-sort]')).toHaveCount(1);
  await table.getByRole('button', { name: 'Might' }).click();
  await expectRows(table, ['flamma', 'spiculus', 'priscus']);
  await expect(table.getByRole('columnheader', { name: 'Might' })).toHaveAttribute('aria-sort', 'descending');

  // Cells show names for refs, and a search finds them by name or by the id they hold.
  await page.getByLabel('Search Gladiator records').fill('magnus');
  await expectRows(table, ['spiculus', 'priscus']);
  await expect(count(page)).toHaveText('2 of 3 records');
  await page.getByLabel('Search Gladiator records').fill('ludus-dacicus');
  await expectRows(table, ['flamma']);
  await page.getByLabel('Search Gladiator records').fill('');

  await page.getByRole('button', { name: 'Add a filter' }).click();
  await page.getByLabel('Filter 1: column').selectOption({ label: 'Might' });
  await page.getByLabel('Filter 1: test').selectOption({ label: 'is at least' });
  // A filter with nothing to compare with tests nothing yet, and says so.
  await expect(page.getByText('Give a value to compare with')).toBeVisible();
  await expectRows(table, ['flamma', 'spiculus', 'priscus']);
  await page.getByLabel('Filter 1: value').fill('70');
  await expectRows(table, ['flamma', 'spiculus']);
  await page.getByRole('button', { name: 'Add a filter' }).click();
  await page.getByLabel('Filter 2: column').selectOption({ label: 'Freed' });
  await page.getByLabel('Filter 2: value').selectOption({ label: 'No' });
  await expectRows(table, ['spiculus']);
  await expect(count(page)).toHaveText('1 of 3 records');
  await page.getByRole('button', { name: 'Remove filter 1' }).click();
  // Focus goes back to where filters come from, not to the next filter's ✕.
  await expect(page.getByRole('button', { name: 'Add a filter' })).toBeFocused();
  await expectRows(table, ['spiculus', 'priscus']);

  // The Project panel's types open their tables; each keeps its own view while the project is open.
  await openProject(page).getByRole('button', { name: 'School 2 records' }).click();
  const schools = page.getByRole('region', { name: 'School records' });
  await expectRows(schools, ['ludus-dacicus', 'ludus-magnus']);
  await expect(
    schools
      .getByRole('row', { name: /Ludus Magnus/ })
      .getByRole('cell')
      .last(),
  ).toHaveText('2');
  await page.getByLabel('Type', { exact: true }).selectOption('gladiator');
  await expectRows(table, ['spiculus', 'priscus']);
  // Opened again, a project's tables start afresh.
  await openProject(page).getByRole('button', { name: 'Close' }).click();
  await page.getByRole('list', { name: 'Projects in this browser' }).getByRole('button', { name: 'Open' }).click();
  await showTable(page, 'Gladiator');
  await expectRows(table, ['flamma', 'priscus', 'spiculus']);
  await expect(page.getByRole('list', { name: 'Filters' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('sets a field on the records selected, as one step undo takes back', async ({ page }) => {
  await importLudus(page);
  const table = await showTable(page, 'Gladiator');
  await table.getByRole('checkbox', { name: 'Select spiculus' }).check();
  await table.getByRole('checkbox', { name: 'Select priscus' }).check();
  await expect(page.getByRole('region', { name: 'Selected records' })).toContainText('2 selected');
  const all = table.getByRole('checkbox', { name: 'Select all 3' });
  await expect.poll(() => all.evaluate((box: HTMLInputElement) => box.indeterminate)).toBe(true);

  await page.getByRole('button', { name: 'Edit a field' }).click();
  const bulk = page.getByRole('region', { name: 'Edit a field on 2 records' });
  // The field list takes focus as it opens.
  await expect(bulk.getByLabel('Field', { exact: true })).toBeFocused();
  await bulk.getByLabel('Field', { exact: true }).selectOption({ label: 'Might' });
  await expect(bulk).toContainText('These records hold different values for Might now.');
  await bulk.getByLabel('Might', { exact: true }).fill('150');
  // The first record's own checks, as its form would show them, once the box is left.
  await bulk.getByLabel('Might', { exact: true }).blur();
  await expect(bulk).toContainText('At most 100');
  await bulk.getByLabel('Might', { exact: true }).fill('50');
  await bulk.getByRole('button', { name: 'Set on 2 records' }).click();
  await expect(page.getByRole('button', { name: 'Edit a field' })).toBeFocused();
  await expect.poll(() => stored(page, SPICULUS)).toMatchObject({ might: 50 });
  // Ctrl+Z in a bulk edit's box undoes its text, not the project's last step, which it never made.
  await page.getByRole('button', { name: 'Edit a field' }).click();
  await bulk.getByLabel('Field', { exact: true }).selectOption({ label: 'Name' });
  await bulk.getByLabel('Name', { exact: true }).press('End');
  await bulk.getByLabel('Name', { exact: true }).pressSequentially('X');
  await bulk.getByLabel('Name', { exact: true }).press('Control+z');
  await expect(page.getByRole('button', { name: 'Undo: Set Might on 2 records' })).toBeEnabled();
  await expect.poll(() => stored(page, SPICULUS)).toMatchObject({ might: 50 });
  await bulk.getByRole('button', { name: 'Cancel' }).click();
  await expect.poll(() => stored(page, PRISCUS)).toMatchObject({ might: 50 });
  await expect(table.getByRole('row', { name: /Flamma/ })).toContainText('80');

  await page.getByRole('button', { name: 'Undo: Set Might on 2 records' }).click();
  await expect.poll(() => stored(page, SPICULUS)).toMatchObject({ might: 72 });
  await expect.poll(() => stored(page, PRISCUS)).toMatchObject({ might: 65 });

  // An optional field can be taken off them all.
  await table.getByRole('checkbox', { name: 'Select priscus' }).uncheck();
  await page.getByRole('button', { name: 'Edit a field' }).click();
  const one = page.getByRole('region', { name: 'Edit a field on 1 record' });
  await one.getByLabel('Field', { exact: true }).selectOption({ label: 'Portrait' });
  await one.getByRole('button', { name: 'Clear on 1 record' }).click();
  await expect.poll(async () => Object.keys((await stored(page, SPICULUS)) as object)).not.toContain('portrait');
  await expect(page.getByRole('button', { name: 'Undo: Clear Portrait on 1 record' })).toBeEnabled();

  // Select all takes every row the view leaves; a search clears the selection.
  await all.check();
  await expect(page.getByRole('region', { name: 'Selected records' })).toContainText('3 selected');
  await page.getByLabel('Search Gladiator records').fill('a');
  await expect(page.getByRole('region', { name: 'Selected records' })).toHaveCount(0);
});

test('duplicates a record under a name, and deletes several as one step', async ({ page }) => {
  await importLudus(page);
  const table = await showTable(page, 'Gladiator');
  await table.getByRole('checkbox', { name: 'Select spiculus' }).check();
  await page.getByRole('region', { name: 'Selected records' }).getByRole('button', { name: 'Duplicate' }).click();
  const name = page.getByLabel('Name of the copy of spiculus');
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Spiculus 2');
  await expect(page.getByText('Saved as records/gladiator/spiculus-2.json')).toBeVisible();
  await page.getByRole('button', { name: 'Duplicate', exact: true }).last().click();
  const form = page.getByRole('region', { name: 'Gladiator spiculus-2' });
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Spiculus 2');
  const original = (await stored(page, SPICULUS)) as Record<string, unknown>;
  await expect
    .poll(() => stored(page, 'records/gladiator/spiculus-2.json'))
    .toEqual({ ...original, name: 'Spiculus 2' });

  await expectRows(table, ['flamma', 'priscus', 'spiculus', 'spiculus-2']);
  await table.getByRole('checkbox', { name: 'Select flamma' }).check();
  await table.getByRole('checkbox', { name: 'Select spiculus-2' }).check();
  await page.getByRole('button', { name: 'Delete 2 records' }).click();
  await expectRows(table, ['priscus', 'spiculus']);
  await expect.poll(() => stored(page, 'records/gladiator/flamma.json')).toBeNull();
  await page.getByRole('button', { name: 'Undo: Delete 2 records' }).click();
  await expectRows(table, ['flamma', 'priscus', 'spiculus', 'spiculus-2']);
  await expect.poll(() => stored(page, 'records/gladiator/flamma.json')).toMatchObject({ name: 'Flamma' });
});

test('lists what uses a record, opens it, and follows a ref to what it names', async ({ page }) => {
  await importLudus(page);
  const school = await openRecord(page, 'School', 'ludus-magnus');
  const usedBy = school.getByRole('region', { name: /Used by/ });
  await expect(usedBy).toContainText('2 records');
  await expect(usedBy.getByRole('listitem')).toHaveText(['Gladiator Priscus School', 'Gladiator Spiculus School']);
  await usedBy.getByRole('button', { name: 'Gladiator Spiculus' }).click();
  const spiculus = page.getByRole('region', { name: 'Gladiator spiculus' });
  await expect(spiculus).toBeVisible();
  await spiculus.getByRole('button', { name: 'Open ludus-magnus' }).click();
  await expect(page.getByRole('region', { name: 'School ludus-magnus' })).toBeVisible();

  const gladius = await openRecord(page, 'Weapon', 'gladius');
  await expect(gladius.getByRole('region', { name: /Used by/ }).getByRole('listitem')).toHaveText([
    'Gladiator Spiculus Weapons carried: gladius',
  ]);

  // Deleted, it still lists what refers to it, and those records show the broken reference.
  const magnus = await openRecord(page, 'School', 'ludus-magnus');
  await magnus.getByRole('button', { name: 'Delete' }).click();
  await expect(magnus).toContainText('This record isn’t there any more');
  await expect(magnus.getByRole('region', { name: /Used by/ })).toContainText('2 records');
  const table = await showTable(page, 'Gladiator');
  await expect(table.getByRole('row', { name: /Spiculus/ }).locator('.cell-problem')).toHaveText('1');
  await page.getByRole('button', { name: 'Undo: Delete ludus-magnus' }).click();
  await expect(table.locator('.cell-problem')).toHaveCount(0);
});

test('duplicates from the inspector, and warns before deleting what others use', async ({ page }) => {
  await importLudus(page);
  const form = await openRecord(page, 'Gladiator', 'priscus');
  await form.getByRole('button', { name: 'Duplicate' }).click();
  await page.getByLabel('Name of the copy of priscus').fill('Priscus Minor');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).last().click();
  await expect(page.getByRole('region', { name: 'Gladiator priscus-minor' })).toBeVisible();
  await expect
    .poll(() => stored(page, 'records/gladiator/priscus-minor.json'))
    .toMatchObject({
      name: 'Priscus Minor',
      kit: { trident: 1, net: 1 },
    });

  const schools = await showTable(page, 'School');
  await schools.getByRole('checkbox', { name: 'Select ludus-magnus' }).check();
  await expect(page.getByRole('region', { name: 'Selected records' })).toContainText(
    '3 records not selected refer to it: deleting leaves those references broken.',
  );
});

test('a read-only tab sorts and searches but changes nothing, and follows the other tab by file', async ({
  page,
  context,
}) => {
  await importLudus(page);
  const form = await openRecord(page, 'Gladiator', 'spiculus');
  const other = await context.newPage();
  await other.setViewportSize({ width: 1280, height: 800 });
  await other.goto('./');
  await other.getByRole('list', { name: 'Projects in this browser' }).getByRole('button', { name: 'Open' }).click();
  await expect(openProject(other)).toContainText('open for editing in another tab');
  const table = await showTable(other, 'Gladiator');
  await expect(table.getByRole('checkbox')).toHaveCount(0);
  await expect(other.getByRole('button', { name: 'New gladiator' })).toHaveCount(0);
  await table.getByRole('button', { name: 'Might' }).click();
  await expectRows(table, ['priscus', 'spiculus', 'flamma']);
  await form.getByLabel('Might', { exact: true }).fill('99');
  await expect(table.getByRole('row', { name: /Spiculus/ })).toContainText('99');
  await expectRows(table, ['priscus', 'flamma', 'spiculus']);
});

test('passes the shared checks with a filter, the selection bar and a bulk edit open', async ({ page }) => {
  await importLudus(page);
  const table = await showTable(page, 'Gladiator');
  await page.getByRole('button', { name: 'Add a filter' }).click();
  await table.getByRole('checkbox', { name: 'Select spiculus' }).check();
  await page.getByRole('button', { name: 'Edit a field' }).click();
  await recordLink(table, 'spiculus').click();
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="records"]')).toEqual([]);
  expect(await smallTargets(page, '[data-panel="inspector"]')).toEqual([]);
  await expectNoAxeIssues(page);
});

test('opens a project’s table offline: the table loads late, from the offline cache', async ({ page, context }) => {
  const errors = watchErrors(page);
  await importLudus(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('list', { name: 'Projects in this browser' }).getByRole('button', { name: 'Open' }).click();
  const table = await showTable(page, 'Gladiator');
  await expectRows(table, ['flamma', 'priscus', 'spiculus']);
  await recordLink(table, 'spiculus').click();
  await expect(page.getByRole('region', { name: 'Gladiator spiculus' })).toBeVisible();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test('draws 100 rows at a time, and focus goes to the first of the last ones shown', async ({ page }) => {
  const extra: Record<string, string> = {};
  for (let i = 0; i < 147; i++) {
    const record = { name: `Gladiator ${i}`, might: i % 101, style: 'murmillo', school: 'ludus-magnus', free: false };
    extra[`records/gladiator/g${i}.json`] = JSON.stringify({ ...record, skills: [], record: { wins: 0, losses: 0 } });
  }
  await importLudus(page, extra);
  const table = await showTable(page, 'Gladiator');
  await expect(count(page)).toHaveText('150 records');
  await expect(table.locator('tbody tr')).toHaveCount(100);
  // Sorting and searching run over every row, not only those drawn.
  await table.getByRole('button', { name: 'Might' }).click();
  await table.getByRole('button', { name: 'Might' }).click();
  await expect(table.locator('tbody .record-id').first()).toHaveText('g100');
  // Select all takes every row the view leaves, not only the 100 drawn.
  await table.getByRole('checkbox', { name: 'Select all 150' }).check();
  await expect(page.getByRole('region', { name: 'Selected records' })).toContainText('150 selected');
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await page.getByRole('button', { name: 'Show 50 more of 50' }).click();
  await expect(table.locator('tbody tr')).toHaveCount(150);
  await expect(table.locator('tbody .record-link').nth(100)).toBeFocused();
  await page.getByLabel('Search Gladiator records').fill('gladiator 146');
  await expectRows(table, ['g146']);
});
