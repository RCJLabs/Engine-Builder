/**
 * M3.1 on phones, portrait and landscape: Logic is the fourth of six tabs (D36), its cards and the
 * sheet editor in the inspector's sheet are in reach, rows and effects are edited by touch; and a
 * flag and a sheet made on a phone, exported, are read by the CLI to the hash of the same files.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { compileProject, memorySource } from '@eb/compiler';
import { expect, type Page, test } from '@playwright/test';
import { readFixture } from '../../../packages/compiler/test/fixture.ts';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { importLudus, LUDUS, openProject, REPO, scratch, showProject, stored } from './ludus.ts';

async function expectFits(page: Page, scope: string): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, scope)).toEqual([]);
  await expectNoAxeIssues(page);
}

const ARENA = {
  name: 'The arena',
  rows: [
    { id: 'open', when: { event: 'flag/changed', args: { flag: 'raids' } }, do: [] },
    {
      id: 'cheer',
      when: { event: 'sheet/fired' },
      if: 'flag.number(raids) >= 3',
      do: [
        {
          effect: 'roll',
          outcomes: [
            { chance: 60, effects: [{ effect: 'add-to-flag', flag: 'raids', by: 1 }] },
            { chance: 40, effects: [] },
          ],
        },
        { effect: 'crowd', mood: 'wild' },
      ],
      once: true,
    },
  ],
};
const EXTRA = {
  'records/flag/raids.json': JSON.stringify({ name: 'Raids', number: { min: 0, max: 5 } }),
  'records/flag/met.json': JSON.stringify({ name: 'Met the trader' }),
  'records/sheet/arena.json': JSON.stringify(ARENA),
};

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 740, height: 360 },
]) {
  test.describe(`logic, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('the Logic tab, its cards, and a row edited in the sheet editor, every control in reach', async ({ page }) => {
      const errors = watchErrors(page);
      await importLudus(page, EXTRA);
      if (viewport.width < viewport.height) {
        const tabs = page.getByRole('tablist').first().getByRole('tab');
        await expect(tabs).toHaveText(['Project', 'Records', 'Assets', 'Logic', /^Problems/, 'More']);
      }
      await page.getByRole('tab', { name: 'Logic' }).tap();
      const panel = page.locator('[data-panel="logic"]');
      await expect(panel.getByRole('button', { name: /^2\. cheer · once/ })).toContainText('If raids is at least 3');
      await expectFits(page, '[data-panel="logic"]');

      await panel.getByRole('button', { name: /^2\. cheer/ }).tap();
      const sheet = page.getByRole('region', { name: 'Trigger sheet arena' });
      const row = sheet.getByRole('group', { name: 'Row 2: cheer' });
      await expect(row.getByRole('group', { name: 'When' }).getByLabel('Event', { exact: true })).toBeFocused();
      await expectFits(page, '[data-panel="inspector"]');

      // A third outcome for the roll, which sets a flag; the chances say they no longer make 100.
      const roll = row.getByRole('group', { name: 'Do' }).first();
      await roll.getByRole('button', { name: 'Add an outcome' }).tap();
      await expect(roll.getByText('Chances add up to 101, and must make 100.')).toBeVisible();
      const third = roll.getByRole('group', { name: 'Outcome 3', exact: true });
      await third.getByRole('button', { name: 'Add effect to Outcome 3 does' }).tap();
      await third.getByLabel('Flag', { exact: true }).selectOption('met');
      await roll
        .getByRole('group', { name: 'Outcome 1', exact: true })
        .getByLabel('Chance', { exact: true })
        .fill('59');
      await expect(roll.getByText('Chances add up to 100.')).toBeVisible();
      await expectFits(page, '[data-panel="inspector"]');

      // The game's own effect goes; the row moves up.
      await row.getByRole('button', { name: 'Remove effect 2' }).tap();
      await sheet.getByRole('button', { name: 'Move row 2 up' }).tap();
      await expect
        .poll(() => stored(page, 'records/sheet/arena.json'))
        .toEqual({
          name: 'The arena',
          rows: [
            {
              ...ARENA.rows[1],
              do: [
                {
                  effect: 'roll',
                  outcomes: [
                    { chance: 59, effects: [{ effect: 'add-to-flag', flag: 'raids', by: 1 }] },
                    { chance: 40, effects: [] },
                    { chance: 1, effects: [{ effect: 'set-flag', flag: 'met', to: true }] },
                  ],
                },
              ],
            },
            ARENA.rows[0],
          ],
        });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('a sheet made on a phone, 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a flag and a row made by touch, exported: the CLI reads the hash of the same files', async ({ page }) => {
    const errors = watchErrors(page);
    await importLudus(page);
    await page.getByRole('tab', { name: 'Logic' }).tap();
    const panel = page.locator('[data-panel="logic"]');
    await panel.getByRole('button', { name: 'New flag' }).tap();
    await panel.getByLabel('Name of the new flag').fill('Crowd won');
    await panel.getByRole('button', { name: 'Create' }).tap();
    await expect(page.getByRole('region', { name: 'Flag crowd-won' })).toBeVisible();
    await page.getByRole('button', { name: 'Inspector' }).tap();

    await panel.getByRole('button', { name: 'New sheet' }).tap();
    await panel.getByLabel('Name of the new sheet').fill('Games');
    await panel.getByRole('button', { name: 'Create' }).tap();
    const sheet = page.getByRole('region', { name: 'Trigger sheet games' });
    await sheet.getByRole('button', { name: 'Add a row' }).tap();
    const row = sheet.getByRole('group', { name: 'Row 1: row-1' });
    await row.getByRole('group', { name: 'When' }).getByLabel(/^Flag/).selectOption('crowd-won');
    await row.getByLabel(/^If/).fill('flag.on(crowd-won)');
    const effects = row.getByRole('group', { name: 'Do' });
    await effects.getByRole('button', { name: 'Add effect to Do' }).tap();
    await effects.getByLabel('Flag', { exact: true }).selectOption('crowd-won');
    await effects.getByLabel('To', { exact: true }).selectOption('off');
    const games = {
      name: 'Games',
      rows: [
        {
          id: 'row-1',
          when: { event: 'flag/changed', args: { flag: 'crowd-won' } },
          if: 'flag.on(crowd-won)',
          do: [{ effect: 'set-flag', flag: 'crowd-won', to: false }],
        },
      ],
    };
    await expect.poll(() => stored(page, 'records/sheet/games.json')).toEqual(games);

    await showProject(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      openProject(page).getByRole('button', { name: 'Export zip' }).tap(),
    ]);
    const exported = join(scratch, 'ludus-phone-logic.zip');
    await download.saveAs(exported);
    const files = readFixture(LUDUS);
    files['records/flag/crowd-won.json'] = JSON.stringify({ name: 'Crowd won' });
    files['records/sheet/games.json'] = JSON.stringify(games);
    const expected = await compileProject(memorySource(files), []);
    expect(expected.diagnostics).toEqual([]);
    const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'validate', exported], { cwd: REPO, encoding: 'utf8' });
    expect(cli).toBe(`10 records: no problems, hash ${expected.pack?.hash}.\n`);
    expect(errors).toEqual([]);
  });
});
