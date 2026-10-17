/**
 * M2.3 in one tab, on real OPFS: edits saved by themselves and kept through a reload, undo and
 * redo by key, button and palette, fields that refuse what project.json can't hold, saving when
 * the page hides, the warning before leaving unsaved edits, and a save cut short finished on open.
 */
import { expect, type Page, test } from '@playwright/test';
import { JOURNAL, journalText } from '../src/editing/journal.ts';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';

const open = (page: Page) => page.getByRole('region', { name: 'Open project' });
const nameField = (page: Page) => open(page).getByLabel('Name');
const saveLine = (page: Page) => open(page).locator('.save-line');

async function newProject(page: Page, name: string): Promise<void> {
  const tab = page.getByRole('tab', { name: 'Project' });
  if (await tab.isVisible()) await tab.click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(open(page).getByRole('heading', { name })).toBeVisible();
}

/** Types at the end of the name, as a person would. */
async function typeIntoName(page: Page, text: string): Promise<void> {
  await nameField(page).click();
  await nameField(page).press('End');
  await page.keyboard.type(text);
}

test.describe('editing, desktop 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('saves an edit by itself and keeps it through a reload', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await newProject(page, 'Dirtbag');
    await typeIntoName(page, ' Valley');
    await expect(saveLine(page)).toHaveText('All changes saved.');
    await expect(open(page).getByRole('heading')).toHaveText('Dirtbag Valley');
    await page.reload();
    const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
    await expect(rows.first()).toContainText('Dirtbag Valley');
    await rows.first().getByRole('button', { name: 'Open' }).click();
    await expect(nameField(page)).toHaveValue('Dirtbag Valley');
    expect(errors).toEqual([]);
  });

  test('undoes and redoes by key, button and palette, naming the step', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await newProject(page, 'Dirtbag');
    await typeIntoName(page, ' Valley');
    const undo = page.getByRole('button', { name: 'Undo: Rename the project' });
    await expect(undo).toBeEnabled();
    await page.keyboard.press('Control+z');
    await expect(nameField(page)).toHaveValue('Dirtbag');
    await expect(page.getByRole('button', { name: 'Redo: Rename the project' })).toBeEnabled();
    await page.keyboard.press('Control+Shift+Z');
    await expect(nameField(page)).toHaveValue('Dirtbag Valley');
    await undo.click();
    await expect(nameField(page)).toHaveValue('Dirtbag');
    await page.keyboard.press('Control+k');
    await page.keyboard.type('redo');
    await expect(page.getByRole('option')).toHaveText(['Redo: Rename the project']);
    await page.keyboard.press('Enter');
    await expect(nameField(page)).toHaveValue('Dirtbag Valley');
    await expect(page.locator('.console')).toContainText('Undone: Rename the project.');
    // Typing pauses make steps of their own: undo takes back the last word, not the whole name.
    await page.waitForTimeout(700);
    await typeIntoName(page, ' Two');
    await page.keyboard.press('Control+z');
    await expect(nameField(page)).toHaveValue('Dirtbag Valley');
    expect(errors).toEqual([]);
  });

  test('keeps what the field can’t hold out of project.json, with the reason', async ({ page }) => {
    await page.goto('./');
    await newProject(page, 'Dirtbag');
    await nameField(page).fill('');
    await expect(open(page).getByText('A project needs a name.')).toBeVisible();
    await expect(nameField(page)).toHaveAttribute('aria-invalid', 'true');
    const version = open(page).getByLabel('Version');
    await version.fill('1.2');
    await expect(open(page).getByText('Expected a version like "1.2.0" or "1.2.0-beta.1"')).toBeVisible();
    await version.fill('1.2.0');
    await expect(saveLine(page)).toHaveText('All changes saved.');
    await nameField(page).fill('');
    await nameField(page).blur();
    await expect(nameField(page)).toHaveValue('Dirtbag');
    await expect(page.getByRole('button', { name: 'Undo: Change the version' })).toBeEnabled();
  });

  test('saves at once when the page hides, without waiting', async ({ page }) => {
    await page.goto('./');
    await newProject(page, 'Dirtbag');
    await typeIntoName(page, ' Valley');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Well inside the second autosave waits: only the hidden page's save can have done it.
    await expect(saveLine(page)).toHaveText('All changes saved.', { timeout: 500 });
  });

  test('asks before leaving with an edit not yet written', async ({ page }) => {
    await page.goto('./');
    await newProject(page, 'Dirtbag');
    await typeIntoName(page, ' Valley');
    const dialog = page.waitForEvent('dialog');
    void page.close({ runBeforeUnload: true });
    expect((await dialog).type()).toBe('beforeunload');
    await (await dialog).dismiss();
  });

  test('finishes a save cut short when the project opens, and drops a torn one', async ({ page }) => {
    await page.goto('./');
    await newProject(page, 'Dirtbag');
    await open(page).getByRole('button', { name: 'Close' }).click();
    const manifest = '{\n  "format": 1,\n  "id": "dirtbag",\n  "name": "Recovered",\n  "version": "0.1.0"\n}\n';
    const whole = journalText([{ path: 'project.json', bytes: new TextEncoder().encode(manifest) }]);
    const leave = async (text: string) =>
      page.evaluate(
        async ({ name, text }) => {
          const project = await (
            await (await navigator.storage.getDirectory()).getDirectoryHandle('projects')
          ).getDirectoryHandle('dirtbag');
          const writable = await (await project.getFileHandle(name, { create: true })).createWritable();
          await writable.write(text);
          await writable.close();
        },
        { name: JOURNAL, text },
      );
    const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
    await leave(whole.slice(0, -10));
    await rows.first().getByRole('button', { name: 'Open' }).click();
    await expect(nameField(page)).toHaveValue('Dirtbag');
    await open(page).getByRole('button', { name: 'Close' }).click();
    await leave(whole);
    await rows.first().getByRole('button', { name: 'Open' }).click();
    await expect(nameField(page)).toHaveValue('Recovered');
    await expect(page.locator('.console')).toContainText('Finished a save that was cut short.');
  });
});

for (const [width, height] of [
  [360, 740],
  [390, 844],
  [844, 390],
] as const) {
  test.describe(`editing, phone ${width}×${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true, colorScheme: 'dark' });

    test('fits the fields and the top bar’s Undo and Redo', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      await newProject(page, 'A Long Project Name For A Small Phone');
      await nameField(page).fill('A Long Project Name For A Small Phone, Renamed');
      await expect(saveLine(page)).toHaveText('All changes saved.');
      await page.getByRole('button', { name: 'Undo: Rename the project' }).tap();
      await expect(nameField(page)).toHaveValue('A Long Project Name For A Small Phone');
      await expectNothingOffscreen(page);
      expect(await smallTargets(page, 'body')).toEqual([]);
      await expectNoAxeIssues(page);
      expect(errors).toEqual([]);
    });
  });
}
