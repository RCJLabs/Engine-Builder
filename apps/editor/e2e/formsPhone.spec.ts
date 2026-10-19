/**
 * M2.4's forms on phones, portrait and landscape, and the Phase 2 gate's automatic half: a
 * project edited through its forms, exported, and read by the CLI to the hash of the same edits.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { compileProject, memorySource } from '@eb/compiler';
import { expect, test } from '@playwright/test';
import { readFixture } from '../../../packages/compiler/test/fixture.ts';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { importLudus, LUDUS, openProject, openRecord, REPO, SPICULUS, scratch, stored } from './ludus.ts';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 740, height: 360 },
]) {
  test.describe(`forms, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('edits a record in the inspector and picks from a list that fits the screen', async ({ page }) => {
      const errors = watchErrors(page);
      await importLudus(page);
      const form = await openRecord(page, 'Gladiator', 'spiculus');
      await form.getByLabel('Name', { exact: true }).fill('Spiculus the Great');
      await expect.poll(() => stored(page, SPICULUS)).toMatchObject({ name: 'Spiculus the Great' });
      await expectNothingOffscreen(page);
      expect(await smallTargets(page, '[data-panel="inspector"]')).toEqual([]);
      await expectNoAxeIssues(page);

      await form.getByRole('button', { name: 'School Ludus Magnus ludus-magnus' }).tap();
      const picker = page.getByRole('dialog', { name: 'Choose a school' });
      await expect(picker).toBeVisible();
      await expectNothingOffscreen(page);
      expect(await smallTargets(page, 'dialog[open]')).toEqual([]);
      await picker.getByRole('option', { name: 'Ludus Dacicus (ludus-dacicus)' }).tap();
      await expect.poll(() => stored(page, SPICULUS)).toMatchObject({ school: 'ludus-dacicus' });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('the Phase 2 gate, desktop 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('exports edits made in forms, which the CLI reads to the hash of the same edits', async ({ page }) => {
    const errors = watchErrors(page);
    await importLudus(page);
    let form = await openRecord(page, 'Gladiator', 'spiculus');
    await form.getByLabel('Might', { exact: true }).fill('90');
    await form.getByLabel('Freed').check();
    await page.getByRole('button', { name: 'New gladiator' }).click();
    await page.getByLabel('Name of the new gladiator').fill('Carpophorus');
    await page.getByRole('button', { name: 'Create' }).click();
    form = page.getByRole('region', { name: 'Gladiator carpophorus' });
    await form.getByLabel('Name', { exact: true }).fill('Carpophorus');
    await form.getByLabel('Style').selectOption('thraex');
    await form.getByRole('button', { name: 'School Not chosen' }).click();
    await page.getByRole('dialog', { name: 'Choose a school' }).getByRole('option', { name: 'ludus-magnus' }).click();
    await form.getByLabel('Fights when').fill('arena.day');
    await expect.poll(() => stored(page, 'records/gladiator/carpophorus.json')).toMatchObject({ fights: 'arena.day' });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      openProject(page).getByRole('button', { name: 'Export zip' }).click(),
    ]);
    const exported = join(scratch, 'ludus-edited.zip');
    await download.saveAs(exported);

    // The same edits made by hand to the fixture's files, compiled in Node.
    const files = readFixture(LUDUS);
    const spiculus = { ...JSON.parse(files[SPICULUS] as string), might: 90, free: true };
    files[SPICULUS] = JSON.stringify(spiculus);
    files['records/gladiator/carpophorus.json'] = JSON.stringify({
      name: 'Carpophorus',
      might: 0,
      style: 'thraex',
      school: 'ludus-magnus',
      free: false,
      skills: [],
      record: { wins: 0, losses: 0 },
      fights: 'arena.day',
    });
    const expected = await compileProject(memorySource(files), []);
    expect(expected.diagnostics).toEqual([]);
    const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'validate', exported], { cwd: REPO, encoding: 'utf8' });
    expect(cli).toBe(`9 records: no problems, hash ${expected.pack?.hash}.\n`);
    expect(errors).toEqual([]);
  });
});

test.describe('a tap that leaves a field, phone 390×1600', () => {
  // Tall enough that the field and the button are both in view, as in forms.spec.ts's press: scrolled
  // to the button, the field would sit above what shows, and scroll anchoring would hide the shift.
  test.use({ viewport: { width: 390, height: 1600 }, hasTouch: true, isMobile: true });

  test('still lands where it was tapped, its problem shown once the tap is done', async ({ page }) => {
    await importLudus(page);
    const form = await openRecord(page, 'Gladiator', 'spiculus');
    const before = ((await stored(page, SPICULUS)) as { skills: unknown[] }).skills.length;
    // On touch the focus moves after the finger lifts, as the tap's mouse events follow it: shown
    // then, At most 100 pushed Add to Skills down before the click, which was lost (M3.9, with a
    // quest's Leads to naming a stage not yet written, on a phone).
    await form.getByLabel('Might', { exact: true }).fill('150');
    await form.getByRole('button', { name: 'Add to Skills', exact: true }).tap({ position: { x: 8, y: 2 } });
    await expect(form.getByRole('textbox', { name: `Skills, item ${before + 1}`, exact: true })).toBeVisible();
    await expect(form.locator('.form-field', { has: page.getByLabel('Might', { exact: true }) })).toContainText(
      'At most 100',
    );
  });
});
