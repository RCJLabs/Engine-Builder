/** M2.6's type designer on a desktop: new types, fields of every sort, renames that carry the records, deletes. */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, watchErrors } from './checks.ts';
import { importLudus, openRecord, SPICULUS, showRecords, showTable, stored } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 800 } });

/** The designer of a type, by its title. */
const designer = (page: Page, title: string): Locator => page.getByRole('region', { name: `Type ${title}` });

/** Opens a type's designer from the Records panel. */
async function editType(page: Page, title: string): Promise<Locator> {
  await showTable(page, title);
  await page.getByRole('button', { name: 'Edit type' }).click();
  const shown = designer(page, title);
  await expect(shown).toBeVisible();
  return shown;
}

/** Opens a field's row in the designer; its editor is a region named for the field. */
async function openField(design: Locator, label: string, name: string): Promise<Locator> {
  await design.getByRole('button', { name: new RegExp(`^${label} `) }).click();
  const field = design.getByRole('region', { name: `Field ${name}` });
  await expect(field).toBeVisible();
  return field;
}

/** Adds a field from the form at the end of the type's fields. */
async function addField(design: Locator, name: string, kind: string, more?: (form: Locator) => Promise<unknown>) {
  await design.getByRole('button', { name: 'Add a field' }).last().click();
  const form = design.getByRole('form', { name: 'New field' });
  await form.getByLabel('Name of the new field').fill(name);
  await form.getByLabel('Kind', { exact: true }).selectOption({ label: kind });
  if (more) await more(form);
  await form.getByRole('button', { name: 'Add field' }).click();
  await expect(form).toHaveCount(0);
}

test('designs a new type, its fields of several kinds, and makes records of it', async ({ page }) => {
  const errors = watchErrors(page);
  await importLudus(page);
  await showRecords(page);
  await page.getByRole('button', { name: 'New type' }).first().click();
  const naming = page.getByRole('form', { name: 'New type' });
  await expect(naming.getByLabel('Name of the new type')).toBeFocused();
  await naming.getByLabel('Name of the new type').fill('School');
  await expect(naming).toContainText('There is a type school already');
  await naming.getByLabel('Name of the new type').fill('Chariot Team');
  await expect(naming).toContainText('Saved as types/chariot-team.json');
  await naming.getByRole('button', { name: 'Create type' }).click();

  const design = designer(page, 'Chariot Team');
  await expect(design.getByRole('heading', { name: 'Type: Chariot Team' })).toBeVisible();
  await expect
    .poll(() => stored(page, 'types/chariot-team.json'))
    .toEqual({ title: 'Chariot Team', nameField: 'name', fields: { name: { kind: 'text', min: 1 } } });

  await addField(design, 'speed', 'Whole number');
  const speed = design.getByRole('region', { name: 'Field speed' });
  await speed.getByLabel(/^Largest/).fill('10');
  await addField(design, 'colours', 'Choice', (form) => form.getByLabel('Choices, one a line').fill('red\nblue\nred'));
  await addField(design, 'driver', 'Record', (form) => form.getByLabel('Names records of').selectOption('gladiator'));
  await addField(design, 'wins', 'Whole number', (form) =>
    form.getByLabel('Optional: records may leave it out').check(),
  );
  await expect
    .poll(() => stored(page, 'types/chariot-team.json'))
    .toMatchObject({
      fields: {
        name: { kind: 'text', min: 1 },
        speed: { kind: 'int', max: 10 },
        colours: { kind: 'enum', values: ['red', 'blue'] },
        driver: { kind: 'ref', to: 'gladiator' },
        wins: { kind: 'int', optional: true },
      },
    });
  await expectNoAxeIssues(page);

  // Its table is the one the Records panel shows, and New fills the name in.
  await showRecords(page);
  await page.getByRole('button', { name: 'New chariot team' }).click();
  await page.getByLabel('Name of the new chariot team').fill('Golden Wheels');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect
    .poll(() => stored(page, 'records/chariot-team/golden-wheels.json'))
    .toEqual({ name: 'Golden Wheels', speed: 0, colours: 'red', driver: '' });
  expect(errors).toEqual([]);
});

const undo = (page: Page, label: string) => page.getByRole('button', { name: `Undo: ${label}` }).click();

test('renames a field, a choice and a type, carrying the records with them, and undo takes each back', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await importLudus(page);
  let design = await editType(page, 'Gladiator');
  const might = await openField(design, 'Might', 'might');
  await might.getByRole('button', { name: 'Rename the field might' }).click();
  await expect(might.getByLabel('New name for the field might')).toBeFocused();
  await might.getByLabel('New name for the field might').fill('style');
  await expect(might).toContainText('There is a field style already');
  await might.getByLabel('New name for the field might').fill('power');
  await expect(might).toContainText('Renamed in the 3 records that hold it too.');
  await might.getByRole('form', { name: 'Rename might' }).getByRole('button', { name: 'Rename' }).click();
  // The field's editor stays open under its new name.
  await expect(design.getByRole('region', { name: 'Field power' })).toBeVisible();
  await expect.poll(() => stored(page, SPICULUS)).toMatchObject({ power: 72 });
  expect(Object.keys((await stored(page, SPICULUS)) as object)).toEqual(
    expect.arrayContaining(['name', 'power', 'style']),
  );
  await undo(page, 'Rename field might to power in type gladiator');
  await expect.poll(() => stored(page, SPICULUS)).toMatchObject({ might: 72 });

  const style = await openField(design, 'Style', 'style');
  await style.getByRole('button', { name: 'Rename the choice murmillo' }).click();
  await style.getByLabel('New name for the choice murmillo').fill('myrmillo');
  await expect(style).toContainText('Renamed in the record that hold');
  await style.getByRole('form', { name: 'Rename murmillo' }).getByRole('button', { name: 'Rename' }).click();
  await expect.poll(() => stored(page, SPICULUS)).toMatchObject({ style: 'myrmillo' });
  await expect
    .poll(() => stored(page, 'types/gladiator.json'))
    .toMatchObject({
      fields: { style: { values: ['retiarius', 'myrmillo', 'secutor', 'thraex'] } },
    });

  design = await editType(page, 'School');
  await design.getByRole('button', { name: 'Rename', exact: true }).click();
  const renaming = design.getByRole('form', { name: 'Rename school' });
  await renaming.getByLabel('New name for the type school').fill('Weapon');
  await expect(renaming).toContainText('There is a type weapon already');
  await renaming.getByLabel('New name for the type school').fill('Academy');
  await renaming.getByRole('button', { name: 'Rename' }).click();
  // The designer follows the type to its new name; its title stays.
  await expect(design.getByText('types/academy.json')).toBeVisible();
  await expect.poll(() => stored(page, 'records/academy/ludus-magnus.json')).toMatchObject({ name: 'Ludus Magnus' });
  await expect.poll(() => stored(page, 'records/school/ludus-magnus.json')).toBeNull();
  await expect
    .poll(() => stored(page, 'types/gladiator.json'))
    .toMatchObject({ fields: { school: { to: 'academy' } } });
  expect(await stored(page, SPICULUS)).toMatchObject({ school: 'ludus-magnus' });
  await expect(page.getByRole('region', { name: 'School records' })).toBeVisible();
  await undo(page, 'Rename type school to academy');
  await expect.poll(() => stored(page, 'types/gladiator.json')).toMatchObject({ fields: { school: { to: 'school' } } });
  await expect.poll(() => stored(page, 'records/school/ludus-magnus.json')).toMatchObject({ name: 'Ludus Magnus' });
  await expectNoAxeIssues(page);
  expect(errors).toEqual([]);
});

test('removes a field from the type and the records, fills in a new required one, and shows what a new kind leaves', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await importLudus(page);
  const design = await editType(page, 'Gladiator');
  const story = await openField(design, 'Story', 'story');
  await story.getByRole('button', { name: 'Remove Story' }).click();
  await expect(story).toContainText('It goes from the 1 record that hold it too');
  await story.getByRole('button', { name: 'Remove Story' }).click();
  await expect.poll(() => stored(page, SPICULUS)).not.toHaveProperty('story');
  await undo(page, 'Remove field story from type gladiator');
  await expect.poll(() => stored(page, SPICULUS)).toHaveProperty('story');

  await addField(design, 'age', 'Whole number', async (form) => {
    await expect(form).toContainText('The 3 records there are get:');
    await form.getByLabel(/^Age for the records there are/).fill('30');
  });
  await expect.poll(() => stored(page, SPICULUS)).toMatchObject({ age: 30 });
  await expect.poll(() => stored(page, 'records/gladiator/flamma.json')).toMatchObject({ age: 30 });

  // Made optional, left out of a record, and required again: the designer offers to fill it in there.
  const age = design.getByRole('region', { name: 'Field age' });
  await age.getByLabel('Optional', { exact: true }).check();
  await expect.poll(() => stored(page, 'types/gladiator.json')).toMatchObject({ fields: { age: { optional: true } } });
  const flamma = await openRecord(page, 'Gladiator', 'flamma');
  // An optional number emptied leaves the record.
  await flamma.getByLabel(/^Age/).fill('');
  await expect.poll(() => stored(page, 'records/gladiator/flamma.json')).not.toHaveProperty('age');
  const again = await editType(page, 'Gladiator');
  const ageAgain = await openField(again, 'Age', 'age');
  await ageAgain.getByLabel('Optional', { exact: true }).uncheck();
  await expect(ageAgain).toContainText('1 record leaves Age out. Give it:');
  await ageAgain.getByLabel(/^Age for the records that leave it out/).fill('25');
  await ageAgain.getByRole('button', { name: 'Fill in 1 record' }).click();
  await expect.poll(() => stored(page, 'records/gladiator/flamma.json')).toMatchObject({ age: 25 });
  await expect(ageAgain.getByRole('button', { name: 'Fill in 1 record' })).toHaveCount(0);

  const might = await openField(again, 'Might', 'might');
  await might.getByLabel('Kind', { exact: true }).selectOption({ label: 'Text' });
  await expect.poll(() => stored(page, 'types/gladiator.json')).toMatchObject({ fields: { might: { kind: 'text' } } });
  await expect(might).toContainText('3 records don’t fit Might');
  // Nothing converted: the records keep their numbers.
  expect(await stored(page, SPICULUS)).toMatchObject({ might: 72 });
  await expect(again).toContainText('3 have problems');
  await again.getByRole('button', { name: 'Show those with problems' }).click();
  await expect(page.getByLabel('Filter 1: column')).toHaveValue('problems');
  await expect(page.locator('.table-count')).toHaveText('3 records');
  expect(errors).toEqual([]);
});

test('a read-only tab shows the designer but changes nothing', async ({ page, context }) => {
  await importLudus(page);
  await editType(page, 'Gladiator');
  const other = await context.newPage();
  await other.setViewportSize({ width: 1280, height: 800 });
  await other.goto('./');
  await other.getByRole('list', { name: 'Projects in this browser' }).getByRole('button', { name: 'Open' }).click();
  await expect(other.getByRole('region', { name: 'Open project' })).toContainText('open for editing in another tab');
  const design = await editType(other, 'Gladiator');
  await expect(other.getByRole('button', { name: 'New type' })).toHaveCount(0);
  for (const name of ['Rename', 'Delete', 'Add a field', 'Move Might up']) {
    await expect(design.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(design.getByLabel('Title', { exact: true })).toHaveAttribute('readonly', '');
  const might = await openField(design, 'Might', 'might');
  await expect(might.getByLabel('Kind', { exact: true })).toBeDisabled();
  await expect(might.getByRole('button', { name: /^Rename|^Remove/ })).toHaveCount(0);
});

test('renames a record and every reference to it, and deletes a type only while nothing refers to it', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await importLudus(page);
  const form = await openRecord(page, 'School', 'ludus-magnus');
  await form.getByRole('button', { name: 'Rename', exact: true }).click();
  await form.getByLabel('New id for ludus-magnus').fill('Ludus Dacicus');
  await expect(form).toContainText('ludus-dacicus is taken');
  await form.getByLabel('New id for ludus-magnus').fill('Ludus Maximus');
  await expect(form).toContainText(
    'Saved as records/school/ludus-maximus.json; the 2 records that refer to it follow.',
  );
  await form.getByRole('form', { name: 'Rename ludus-magnus' }).getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('region', { name: 'School ludus-maximus' })).toBeVisible();
  await expect.poll(() => stored(page, SPICULUS)).toMatchObject({ school: 'ludus-maximus' });
  await expect.poll(() => stored(page, 'records/gladiator/priscus.json')).toMatchObject({ school: 'ludus-maximus' });
  await expect.poll(() => stored(page, 'records/school/ludus-magnus.json')).toBeNull();

  let design = await editType(page, 'School');
  await design.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(design).toContainText('School can’t be deleted while Gladiator refers to it.');
  await expect(design.getByRole('button', { name: 'Delete School' })).toHaveCount(0);
  await design.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'New type' }).first().click();
  await page.getByLabel('Name of the new type').fill('Chariot');
  await page.getByRole('button', { name: 'Create type' }).click();
  design = designer(page, 'Chariot');
  await design.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(design).toContainText('Delete Chariot and its 0 records? Undo brings them back.');
  await design.getByRole('button', { name: 'Delete Chariot' }).click();
  await expect.poll(() => stored(page, 'types/chariot.json')).toBeNull();
  await expect(page.getByText('Choose a record or a type to edit it here.')).toBeVisible();
  await undo(page, 'Delete type Chariot');
  await expect.poll(() => stored(page, 'types/chariot.json')).toMatchObject({ title: 'Chariot' });
  expect(errors).toEqual([]);
});
