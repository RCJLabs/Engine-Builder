/**
 * M2.4's record forms on a desktop, on real OPFS: the ludus fixture, a project made only of data,
 * edited through every kind of field. What a form shows is what the file holds, read back from
 * OPFS; the problems beside the fields are the compiler's own.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { importLudus, openProject, openRecord, SPICULUS, stored } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 800 } });

const spiculus = (page: Page) => expect.poll(() => stored(page, SPICULUS));

test('edits text, numbers, choices and yes or no, and keeps them through a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await importLudus(page);
  let form = await openRecord(page, 'Gladiator', 'spiculus');
  await form.getByLabel('Name', { exact: true }).fill('Spiculus the Great');
  await form.getByLabel('Might', { exact: true }).fill('90');
  await form.getByLabel('Style').selectOption('thraex');
  await form.getByLabel('Freed').check();
  await form.getByLabel('Story').fill('Freed by Nero.');
  await spiculus(page).toMatchObject({
    name: 'Spiculus the Great',
    might: 90,
    style: 'thraex',
    free: true,
    story: 'Freed by Nero.',
  });
  // An optional text field emptied leaves the record.
  await form.getByLabel('Story').fill('');
  await expect.poll(async () => Object.keys((await stored(page, SPICULUS)) as object)).not.toContain('story');
  // The phone keyboard each number asks for: digits for a whole number that can't be negative.
  await expect(form.getByLabel('Might', { exact: true })).toHaveAttribute('inputmode', 'numeric');
  // The slider moves the same value, and the box follows it.
  await form.getByLabel('Might, slider').focus();
  await page.keyboard.press('End');
  await expect(form.getByLabel('Might', { exact: true })).toHaveValue('100');
  await spiculus(page).toMatchObject({ might: 100 });

  await page.reload();
  await page.getByRole('list', { name: 'Projects in this browser' }).getByRole('button', { name: 'Open' }).click();
  form = await openRecord(page, 'Gladiator', 'spiculus');
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Spiculus the Great');
  await expect(form.getByLabel('Style')).toHaveValue('thraex');
  await expect(form.getByLabel('Freed')).toBeChecked();
  expect(errors).toEqual([]);
});

test('undoes typing in a field as one step, named for the field and the record', async ({ page }) => {
  await importLudus(page);
  const form = await openRecord(page, 'Gladiator', 'spiculus');
  const name = form.getByLabel('Name', { exact: true });
  await name.click();
  await name.press('End');
  await page.keyboard.type(' II');
  await expect(page.getByRole('button', { name: 'Undo: Edit Name in spiculus' })).toBeEnabled();
  await spiculus(page).toMatchObject({ name: 'Spiculus II' });
  // The editor's undo, not the browser's own in the box: the step goes to redo.
  await page.keyboard.press('Control+z');
  await expect(name).toHaveValue('Spiculus');
  await expect(page.getByRole('button', { name: 'Redo: Edit Name in spiculus' })).toBeEnabled();
  await spiculus(page).toMatchObject({ name: 'Spiculus' });
  // Redo: the form reads the file again, rather than showing what it read first.
  await page.keyboard.press('Control+Shift+Z');
  await expect(name).toHaveValue('Spiculus II');
});

test('chooses a record from a list it searches, and clears an optional field', async ({ page }) => {
  const errors = watchErrors(page);
  await importLudus(page);
  const form = await openRecord(page, 'Gladiator', 'spiculus');
  await form.getByRole('button', { name: 'School ludus-magnus' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a school' });
  await expect(picker.getByRole('option')).toHaveCount(2);
  await picker.getByRole('combobox', { name: 'Search' }).fill('dac');
  await expect(picker.getByRole('option')).toHaveText(['ludus-dacicus']);
  await page.keyboard.press('Enter');
  await expect(picker).toHaveCount(0);
  // Focus goes back to the field's button, which names what it now holds.
  await expect(form.getByRole('button', { name: 'School ludus-dacicus' })).toBeFocused();
  await spiculus(page).toMatchObject({ school: 'ludus-dacicus' });

  await form.getByRole('button', { name: 'Clear Portrait' }).click();
  await expect.poll(async () => Object.keys((await stored(page, SPICULUS)) as object)).not.toContain('portrait');
  await expect(form.getByRole('button', { name: 'Portrait (optional) Not chosen' })).toBeVisible();
  await form.getByRole('button', { name: 'Portrait (optional) Not chosen' }).click();
  await page
    .getByRole('dialog', { name: 'Choose an image' })
    .getByRole('option', { name: 'portraits/spiculus.svg' })
    .click();
  await spiculus(page).toMatchObject({ portrait: 'portraits/spiculus.svg' });
  expect(errors).toEqual([]);
});

test('adds, moves and removes list items and map entries, focus following', async ({ page }) => {
  await importLudus(page);
  const form = await openRecord(page, 'Gladiator', 'spiculus');
  await form.getByRole('button', { name: 'Add to Skills' }).click();
  // Focus goes to the new item, ready to type.
  await expect(form.getByLabel('Skills, item 3')).toBeFocused();
  await page.keyboard.type('trident work');
  await form.getByRole('button', { name: 'Move Skills item 3 up' }).click();
  await expect(form.getByRole('button', { name: 'Move Skills item 2 up' })).toBeFocused();
  await spiculus(page).toMatchObject({ skills: ['feint', 'trident work', 'shield wall'] });
  await form.getByRole('button', { name: 'Remove Skills item 1' }).click();
  await spiculus(page).toMatchObject({ skills: ['trident work', 'shield wall'] });

  await form.getByRole('button', { name: 'Add to Weapons carried' }).click();
  const picker = page.getByRole('dialog', { name: 'Add to Weapons carried' });
  // Gladius is carried already, so only the others are offered.
  await expect(picker.getByRole('option')).toHaveText(['net', 'trident']);
  await picker.getByRole('option', { name: 'trident' }).click();
  await form.getByLabel('Weapons carried: trident', { exact: true }).fill('2');
  await spiculus(page).toMatchObject({ kit: { gladius: 1, trident: 2 } });
  await form.getByRole('button', { name: 'Weapons carried: gladius, change the key' }).click();
  await page.getByRole('dialog', { name: 'A key for gladius' }).getByRole('option', { name: 'net' }).click();
  await expect
    .poll(async () => Object.keys(((await stored(page, SPICULUS)) as { kit: object }).kit))
    .toEqual(['net', 'trident']);
  await form.getByRole('button', { name: 'Remove net from Weapons carried' }).click();
  await spiculus(page).toMatchObject({ kit: { trident: 2 } });
});

test('keeps a condition as the file holds it, reads it in words, and parses as it is typed', async ({ page }) => {
  await importLudus(page);
  let form = await openRecord(page, 'Gladiator', 'spiculus');
  const fights = form.getByLabel('Fights when');
  await expect(form).toContainText('Reads: Arena day and not crowd angry.');
  await fights.fill('arena.day and crowd.size > 1000');
  // Text stays text, as typed.
  await spiculus(page).toMatchObject({ fights: 'arena.day and crowd.size > 1000' });
  await expect(form).toContainText('Reads: Arena day and crowd size is more than 1000.');
  await fights.fill('arena.day and');
  await expect(form.locator('.field-problem')).toHaveCount(0);
  await form.getByLabel('Name', { exact: true }).focus();
  await expect(form).toContainText('Expected a fact, like hold.count, but the text ended (column 14)');

  form = await openRecord(page, 'Gladiator', 'flamma');
  await form.getByLabel('Fights when').fill('arena.day or arena.night');
  // A tree stays a tree.
  await expect
    .poll(() => stored(page, 'records/gladiator/flamma.json'))
    .toMatchObject({ fights: { any: [{ fact: 'arena.day' }, { fact: 'arena.night' }] } });
});

test('shows the compiler’s problems beside their fields, and keeps what isn’t a number yet', async ({ page }) => {
  await importLudus(page, {
    'records/gladiator/priscus.json': JSON.stringify({
      name: 'Priscus',
      might: 65,
      style: 'hoplomachus',
      school: 'ludus-magnus',
      free: false,
      skills: [],
      record: { wins: 9, losses: 2 },
      horse: 'Incitatus',
    }),
  });
  const form = await openRecord(page, 'Gladiator', 'priscus');
  // A value the type doesn't list stays on show, marked, with the compiler's word on it.
  await expect(form.getByLabel('Style')).toHaveValue('hoplomachus');
  await expect(form.getByLabel('Style').locator('option:checked')).toHaveText('hoplomachus (not one of the choices)');
  await expect(form).toContainText('Expected one of: retiarius, murmillo, secutor, thraex');
  await expect(form).toContainText('The type has no field “horse”.');
  await form.getByRole('button', { name: 'Remove “horse”' }).click();
  await expect
    .poll(async () => Object.keys((await stored(page, 'records/gladiator/priscus.json')) as object))
    .not.toContain('horse');

  const might = form.getByLabel('Might', { exact: true });
  await might.fill('150');
  // Written as typed, though it breaks the rule: the file holds what the form shows.
  await expect.poll(() => stored(page, 'records/gladiator/priscus.json')).toMatchObject({ might: 150 });
  await might.blur();
  await expect(form.locator('.form-field', { has: page.getByLabel('Might', { exact: true }) })).toContainText(
    'At most 100',
  );
  await might.fill('7x');
  await might.blur();
  await expect(might).toHaveValue('7x');
  await expect(form.locator('.form-field', { has: page.getByLabel('Might', { exact: true }) })).toContainText(
    'Not a number yet',
  );
  // Saves land in order, so once a later edit is in the file, "7x" would be too had it been written.
  await form.getByLabel('Name', { exact: true }).fill('Priscus Secundus');
  await expect
    .poll(() => stored(page, 'records/gladiator/priscus.json'))
    .toMatchObject({ name: 'Priscus Secundus', might: 150 });
});

test('creates a record with its type’s fields to fill in, deletes it, and undo brings it back', async ({ page }) => {
  const errors = watchErrors(page);
  await importLudus(page);
  await page.getByRole('button', { name: 'New gladiator' }).click();
  await page.getByLabel('Name of the new gladiator').fill('Carpophorus the Bold');
  await expect(page.getByText('Saved as records/gladiator/carpophorus-the-bold.json')).toBeVisible();
  await page.getByRole('button', { name: 'Create' }).click();
  const form = page.getByRole('region', { name: 'Gladiator carpophorus-the-bold' });
  await expect(form).toBeVisible();
  await expect(form).toContainText('Write something here');
  await expect(form).toContainText('No school chosen yet');
  // The Project panel lists it, chosen.
  await expect(
    page.getByRole('region', { name: 'Records' }).getByRole('button', { name: 'carpophorus-the-bold' }),
  ).toHaveAttribute('aria-current', 'true');
  await expect
    .poll(() => stored(page, 'records/gladiator/carpophorus-the-bold.json'))
    .toEqual({
      name: '',
      might: 0,
      style: 'retiarius',
      school: '',
      free: false,
      skills: [],
      record: { wins: 0, losses: 0 },
    });
  await form.getByRole('button', { name: 'Delete' }).click();
  await expect(form).toContainText('This record isn’t there any more');
  await expect.poll(() => stored(page, 'records/gladiator/carpophorus-the-bold.json')).toBeNull();
  await page.getByRole('button', { name: 'Undo: Delete carpophorus-the-bold' }).click();
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('');
  expect(errors).toEqual([]);
});

test('passes the shared checks with a whole form open', async ({ page }) => {
  await importLudus(page);
  await openRecord(page, 'Gladiator', 'spiculus');
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="inspector"]')).toEqual([]);
  expect(await smallTargets(page, '[data-panel="project"]')).toEqual([]);
  await expectNoAxeIssues(page);
  await page.getByRole('button', { name: 'School ludus-magnus' }).click();
  await expectNoAxeIssues(page);
});

test('opens read only in a second tab, which follows the first tab’s edits', async ({ page, context }) => {
  await importLudus(page);
  const form = await openRecord(page, 'Gladiator', 'spiculus');
  const other = await context.newPage();
  await other.goto('./');
  await other.getByRole('list', { name: 'Projects in this browser' }).getByRole('button', { name: 'Open' }).click();
  await expect(openProject(other)).toContainText('open for editing in another tab');
  const otherForm = await openRecord(other, 'Gladiator', 'spiculus');
  await expect(otherForm.getByLabel('Name', { exact: true })).toHaveAttribute('readonly', '');
  await expect(otherForm.getByLabel('Style')).toBeDisabled();
  await expect(otherForm.getByRole('button', { name: 'Add to Skills' })).toBeDisabled();
  await form.getByLabel('Name', { exact: true }).fill('Spiculus Secundus');
  await expect(otherForm.getByLabel('Name', { exact: true })).toHaveValue('Spiculus Secundus');
});
