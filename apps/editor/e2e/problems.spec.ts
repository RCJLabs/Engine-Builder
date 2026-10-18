/**
 * M2.8's Problems panel and console on desktop: the list is what `eb validate` says of the same
 * files, it follows edits, and each problem opens where it is fixed; the console copies and clears.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';
import { importLudus, LUDUS, ludusZip, REPO, SPICULUS } from './ludus.ts';

const spiculus = JSON.parse(readFileSync(join(LUDUS, SPICULUS), 'utf8'));

/** A problem of each place the panel opens, and one it can't. */
const PLANTED = {
  'records/gladiator/bad.json': JSON.stringify({ ...spiculus, name: 'Bad', might: 'strong' }),
  'records/gladiator/notes.md': 'Gladiators fight at noon.',
  'types/horse.json': JSON.stringify({ title: 'Horse', fields: { speed: { kind: 'nope' } } }),
  'assets/portraits/unlogged.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>',
};

interface Said {
  readonly code: string;
  readonly message: string;
}

/** What `eb validate` says of the planted project, from a zip of the same files. */
function validate(files: Record<string, string>): Said[] {
  const run = spawnSync('node', ['tools/cli/src/cli.ts', 'validate', ludusZip(files), '--json'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  return (JSON.parse(run.stdout) as { diagnostics: Said[] }).diagnostics;
}

/** The listed problems not matched one to one with the CLI's, and the CLI's not listed. */
async function mismatches(items: Locator, expected: readonly Said[]): Promise<string[]> {
  const left = await items.allInnerTexts();
  const missing: string[] = [];
  for (const { code, message } of expected) {
    const at = left.findIndex((text) => text.includes(`${code} ${message}`));
    if (at < 0) missing.push(`missing: ${code} ${message}`);
    else left.splice(at, 1);
  }
  return [...missing, ...left.map((text) => `extra: ${text}`)];
}

async function showProblems(page: Page): Promise<Locator> {
  await page.getByRole('tab', { name: /^Problems/ }).click();
  const panel = page.locator('[data-panel="problems"]');
  await expect(panel.getByRole('heading', { name: 'Problems' })).toBeVisible();
  return panel;
}

test('lists what eb validate says, follows edits, and opens each problem where it is fixed', async ({ page }) => {
  const errors = watchErrors(page);
  const expected = validate(PLANTED);
  expect(expected.map((said) => said.code).sort()).toEqual(['E001', 'E015', 'E019', 'W101']);
  await importLudus(page, PLANTED);
  // The dock's tab carries the count, in its words and its name; the panel's badge says what kind.
  await expect(page.getByRole('tab', { name: 'Problems (4)' })).toHaveText('Problems (4)');
  const panel = await showProblems(page);
  await expect(panel.getByText('3 errors and 1 warning')).toBeVisible();
  const items = panel.locator('.problem-items > li');
  await expect(items).toHaveCount(4);
  expect(await mismatches(items, expected)).toEqual([]);
  await expect(items.filter({ hasText: 'W101' })).toContainText('Move or delete it outside the editor.');
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  // A record's problem opens its form at the field, focused.
  await panel.getByRole('button', { name: /E001 .* · Might$/ }).click();
  const form = page.getByRole('region', { name: 'Gladiator bad' });
  const might = form.getByLabel('Might', { exact: true });
  await expect(might).toBeFocused();
  await might.fill('50');
  await expect(items).toHaveCount(3);
  await expect(page.getByRole('tab', { name: 'Problems (3)' })).toBeVisible();
  expect(
    await mismatches(
      items,
      validate({ ...PLANTED, 'records/gladiator/bad.json': JSON.stringify({ ...spiculus, name: 'Bad', might: 50 }) }),
    ),
  ).toEqual([]);

  // A type file's problem opens the designer; an asset's, the asset.
  await panel.getByRole('button', { name: /E015 / }).click();
  await expect(page.getByRole('region', { name: 'Type Horse' })).toBeVisible();
  await panel.getByRole('button', { name: /E019 / }).click();
  await expect(page.getByRole('region', { name: 'Asset portraits/unlogged.svg' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('focuses the field of the record a problem names, whatever form is open', async ({ page }) => {
  const errors = watchErrors(page);
  await importLudus(page, {
    'records/gladiator/bad.json': JSON.stringify({ ...spiculus, name: 'Bad', might: 'strong' }),
    'records/gladiator/worse.json': JSON.stringify({ ...spiculus, name: 'Worse', record: { wins: 'many', losses: 0 } }),
  });
  const panel = await showProblems(page);
  await panel.getByRole('button', { name: /E001 .* · Might$/ }).click();
  await expect(page.getByRole('region', { name: 'Gladiator bad' }).getByLabel('Might', { exact: true })).toBeFocused();
  // The open form is not the one to focus: the next form shown is.
  await panel.getByRole('button', { name: /E001 .* · Wins and losses: Wins$/ }).click();
  await expect(page.getByRole('region', { name: 'Gladiator worse' }).getByLabel('Wins', { exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test('draws 200 problems, then the rest on asking', async ({ page }) => {
  const errors = watchErrors(page);
  const many: Record<string, string> = {};
  for (let i = 0; i < 201; i++) {
    many[`records/gladiator/g${i}.json`] = JSON.stringify({ ...spiculus, name: `G ${i}`, might: 'strong' });
  }
  await importLudus(page, many);
  const panel = await showProblems(page);
  const items = panel.locator('.problem-items > li');
  await expect(panel.getByText('201 in all')).toBeVisible();
  await expect(items).toHaveCount(200);
  await panel.getByRole('button', { name: 'Show 1 more' }).click();
  await expect(items).toHaveCount(201);
  expect(errors).toEqual([]);
});

test('filters the list by severity and by words, and keeps the filter while away', async ({ page }) => {
  const errors = watchErrors(page);
  await importLudus(page, PLANTED);
  const panel = await showProblems(page);
  const items = panel.locator('.problem-items > li');
  await panel.getByLabel('Show').selectOption('warning');
  await expect(items).toHaveCount(1);
  await expect(items).toContainText('W101');
  await expect(panel.getByText('1 of 4')).toBeVisible();
  await panel.getByLabel('Show').selectOption('all');
  await panel.getByLabel('Search problems').fill('horse');
  await expect(items).toHaveCount(1);
  await expect(items).toContainText('E015');
  await page.getByRole('tab', { name: 'Console' }).click();
  await showProblems(page);
  await expect(panel.getByLabel('Search problems')).toHaveValue('horse');
  await expect(items).toHaveCount(1);
  expect(errors).toEqual([]);
});

test.describe('the console', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('copies every line for a bug report, and clears', async ({ page }) => {
    const errors = watchErrors(page);
    await importLudus(page);
    const log = page.locator('.console');
    await expect(log).toContainText('Opened Ludus from this browser.');
    // The service worker's line comes once its precache is in (1.8 MB since M3.2), and on a busy
    // runner that was after the Clear below (M3.2's CI). Waited for, it can't land after it.
    await expect(log).toContainText('Offline copy saved', { timeout: 15_000 });
    await log.getByRole('button', { name: 'Copy all' }).click();
    await expect(log).toContainText('Copied the console.');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('Engine-Builder');
    // Each line with its time, in the browser's own form ("03:42:58 AM" in en-US).
    expect(copied).toMatch(/^\d\d:\d\d:\d\d( [AP]M)? Opened Ludus from this browser\.$/m);
    await log.getByRole('button', { name: 'Clear' }).click();
    await expect(log.getByRole('list', { name: 'Console messages' }).getByRole('listitem')).toHaveCount(0);
    await expect(log.getByRole('button', { name: 'Copy all' })).toBeDisabled();
    expect(errors).toEqual([]);
  });
});
