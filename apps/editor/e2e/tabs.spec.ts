/**
 * M2.3's one editing tab per project, with real Web Locks and BroadcastChannel in Chromium: a
 * second tab opens read only and follows the first's saves, takes editing over when asked or
 * when the first doesn't answer, and can't delete a project open for editing. Plus an opened
 * folder, which waits for permission before its first edit.
 */
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';

test.use({ viewport: { width: 1280, height: 800 } });

const open = (page: Page) => page.getByRole('region', { name: 'Open project' });
const access = (page: Page) => open(page).locator('.access-line');
const nameField = (page: Page) => open(page).getByLabel('Name');
const rows = (page: Page) => page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');

async function newProject(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(open(page).getByRole('heading', { name })).toBeVisible();
}

/** A second tab on the same browser storage, with the project open. */
async function secondTab(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto('./');
  await rows(page).first().getByRole('button', { name: 'Open' }).click();
  return page;
}

test('opens read only in a second tab, which follows the first tab’s saves', async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await newProject(page, 'Dirtbag');
  const other = await secondTab(context);
  await expect(access(other)).toContainText('open for editing in another tab');
  await expect(nameField(other)).toHaveAttribute('readonly', '');
  await nameField(page).fill('Dirtbag Valley');
  await expect(open(page).locator('.save-line')).toHaveText('All changes saved.');
  await expect(nameField(other)).toHaveValue('Dirtbag Valley');
  expect(errors).toEqual([]);
});

test('hands editing over: the editing tab saves first and goes read only', async ({ page, context }) => {
  await page.goto('./');
  await newProject(page, 'Dirtbag');
  const other = await secondTab(context);
  await nameField(page).fill('Typed just before');
  await open(other).getByRole('button', { name: 'Edit here' }).click();
  await expect(access(page)).toContainText('Editing moved to another tab.');
  await expect(access(other)).toHaveCount(0);
  await expect(nameField(other)).toHaveValue('Typed just before');
  await nameField(other).fill('Edited in the second tab');
  await expect(open(other).locator('.save-line')).toHaveText('All changes saved.');
  await expect(nameField(page)).toHaveValue('Edited in the second tab');
});

test('takes over from a tab that doesn’t answer, which then stops saving', async ({ page, context }) => {
  // This tab never hears the other: as if frozen in the background.
  await page.addInitScript(() => {
    (globalThis as { BroadcastChannel: unknown }).BroadcastChannel = class {
      postMessage() {}
      addEventListener() {}
      removeEventListener() {}
    };
  });
  await page.goto('./');
  await newProject(page, 'Dirtbag');
  const other = await secondTab(context);
  await open(other).getByRole('button', { name: 'Edit here' }).click();
  await expect(access(other)).toContainText('Asking the other tab');
  const takeOver = open(other).getByRole('button', { name: 'Take over' });
  await expect(takeOver).toBeVisible({ timeout: 8_000 });
  await takeOver.click();
  await expect(access(other)).toHaveCount(0);
  await expect(access(page)).toContainText('This tab stopped editing: another tab took over');
  await expect(nameField(page)).toHaveAttribute('readonly', '');
});

test('won’t delete a project another tab is editing', async ({ page, context }) => {
  await page.goto('./');
  await newProject(page, 'Dirtbag');
  const other = await context.newPage();
  await other.goto('./');
  await rows(other).first().getByRole('button', { name: 'Delete' }).click();
  await rows(other).first().getByRole('button', { name: 'Delete' }).click();
  // Scoped to the panel: the dock keeps a live region of its own with the alert role.
  await expect(other.locator('[data-panel="project"]').getByRole('alert')).toHaveText(
    'It is open for editing in another tab. Close it there first.',
  );
  await expect(rows(other)).toHaveCount(1);
});

test('asks before changing an opened folder, then saves into it', async ({ page }) => {
  // The picker can't be driven, so it hands back an OPFS folder that says it may only be read until asked.
  await page.addInitScript(() => {
    (globalThis as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('my-game', { create: true });
      const manifest = await (await dir.getFileHandle('project.json', { create: true })).createWritable();
      await manifest.write('{\n  "format": 1,\n  "id": "my-game",\n  "name": "My Game",\n  "version": "1.0.0"\n}\n');
      await manifest.close();
      let allowed = false;
      return Object.assign(dir, {
        queryPermission: async ({ mode }: { mode: string }) => (mode === 'read' || allowed ? 'granted' : 'prompt'),
        requestPermission: async () => {
          allowed = true;
          return 'granted';
        },
      });
    };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Open folder' }).click();
  await expect(access(page)).toContainText('This folder is open read only.');
  await expect(nameField(page)).toHaveAttribute('readonly', '');
  await open(page).getByRole('button', { name: 'Allow changes' }).click();
  await expect(access(page)).toHaveCount(0);
  await nameField(page).fill('My Renamed Game');
  await expect(open(page).locator('.save-line')).toHaveText('All changes saved.');
  const saved = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('my-game');
    return (await (await dir.getFileHandle('project.json')).getFile()).text();
  });
  expect(saved).toBe('{\n  "format": 1,\n  "id": "my-game",\n  "name": "My Renamed Game",\n  "version": "1.0.0"\n}\n');
});
