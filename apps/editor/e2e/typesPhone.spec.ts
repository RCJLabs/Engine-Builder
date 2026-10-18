/**
 * M2.6's type designer on phones, portrait and landscape, in the inspector's sheet; and the
 * Phase 2 gate's automatic half for M2.6: a type designed on a phone, records made of it,
 * exported, and read by the CLI with no --types module to the hash of the same files made in Node.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { compileProject, memorySource } from '@eb/compiler';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { readFixture } from '../../../packages/compiler/test/fixture.ts';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import {
  importLudus,
  LUDUS,
  openProject,
  REPO,
  scratch,
  showProject,
  showRecords,
  showTable,
  stored,
} from './ludus.ts';

/** Adds a field from the form at the end of the type's fields, by touch. */
async function addField(design: Locator, name: string, kind: string, more?: (form: Locator) => Promise<unknown>) {
  await design.getByRole('button', { name: 'Add a field' }).last().tap();
  const form = design.getByRole('form', { name: 'New field' });
  await form.getByLabel('Name of the new field').fill(name);
  await form.getByLabel('Kind', { exact: true }).selectOption({ label: kind });
  if (more) await more(form);
  await form.getByRole('button', { name: 'Add field' }).tap();
  await expect(form).toHaveCount(0);
}

async function expectFits(page: Page): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="inspector"]')).toEqual([]);
  await expectNoAxeIssues(page);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 740, height: 360 },
]) {
  test.describe(`type designer, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('designs a type in the inspector’s sheet, every control in reach', async ({ page }) => {
      const errors = watchErrors(page);
      await importLudus(page);
      await showTable(page, 'Gladiator');
      await page.getByRole('button', { name: 'Edit type' }).tap();
      const design = page.getByRole('region', { name: 'Type Gladiator' });
      await expect(design).toBeVisible();
      await expectFits(page);
      await design.getByRole('button', { name: /^Weapons carried / }).tap();
      const kit = design.getByRole('region', { name: 'Field kit' });
      await expect(kit.getByRole('group', { name: 'Names records of' })).toBeVisible();
      await expectFits(page);
      await design.getByRole('button', { name: /^Style / }).tap();
      await design.getByRole('button', { name: 'Add a field' }).last().tap();
      await expect(design.getByRole('form', { name: 'New field' })).toBeVisible();
      await expectFits(page);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('the Phase 2 gate, phone 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a type designed on a phone, records of it, exported: the CLI reads the hash of the same files', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await importLudus(page);
    await showRecords(page);
    await page.getByRole('button', { name: 'New type' }).first().tap();
    await page.getByLabel('Name of the new type').fill('Chariot');
    await page.getByRole('button', { name: 'Create type' }).tap();
    const design = page.getByRole('region', { name: 'Type Chariot' });
    await addField(design, 'speed', 'Whole number');
    await design
      .getByRole('region', { name: 'Field speed' })
      .getByLabel(/^Largest/)
      .fill('10');
    await addField(design, 'colour', 'Choice', (form) => form.getByLabel('Choices, one a line').fill('red\nblue'));
    await addField(design, 'driver', 'Record', (form) => form.getByLabel('Names records of').selectOption('gladiator'));
    await expect.poll(() => stored(page, 'types/chariot.json')).toMatchObject({ fields: { speed: { max: 10 } } });

    await showRecords(page);
    await page.getByRole('button', { name: 'New chariot' }).tap();
    await page.getByLabel('Name of the new chariot').fill('Golden Wheels');
    await page.getByRole('button', { name: 'Create' }).tap();
    const golden = page.getByRole('region', { name: 'Chariot golden-wheels' });
    await golden.getByLabel('Speed', { exact: true }).fill('7');
    await golden.getByLabel('Colour', { exact: true }).selectOption('blue');
    await golden.getByRole('button', { name: 'Driver Not chosen' }).tap();
    await page
      .getByRole('dialog', { name: 'Choose a gladiator' })
      .getByRole('option', { name: /spiculus/ })
      .tap();
    await expect
      .poll(() => stored(page, 'records/chariot/golden-wheels.json'))
      .toEqual({ name: 'Golden Wheels', speed: 7, colour: 'blue', driver: 'spiculus' });

    await showProject(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      openProject(page).getByRole('button', { name: 'Export zip' }).tap(),
    ]);
    const exported = join(scratch, 'ludus-designed.zip');
    await download.saveAs(exported);

    // The same type and record written by hand beside the fixture's files, compiled in Node.
    const files = readFixture(LUDUS);
    files['types/chariot.json'] = JSON.stringify({
      title: 'Chariot',
      nameField: 'name',
      fields: {
        name: { kind: 'text', min: 1 },
        speed: { kind: 'int', max: 10 },
        colour: { kind: 'enum', values: ['red', 'blue'] },
        driver: { kind: 'ref', to: 'gladiator' },
      },
    });
    files['records/chariot/golden-wheels.json'] = JSON.stringify({
      name: 'Golden Wheels',
      speed: 7,
      colour: 'blue',
      driver: 'spiculus',
    });
    const expected = await compileProject(memorySource(files), []);
    expect(expected.diagnostics).toEqual([]);
    const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'validate', exported], { cwd: REPO, encoding: 'utf8' });
    expect(cli).toBe(`9 records: no problems, hash ${expected.pack?.hash}.\n`);
    expect(errors).toEqual([]);
  });
});
