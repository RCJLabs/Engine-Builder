/**
 * What the kits' e2e specs share (M3.3 to M3.5): a new project, a stored file read back, as JSON or
 * as text, a record of a kit's type made in Records, a record picked, the Logic panel, and a
 * fixture folder as a zip.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { openProject, scratch, showProject, showRecords } from './ludus.ts';

/** A fixture folder as a zip made by Python, under a folder of its name. */
export function fixtureZip(dir: string, name: string): string {
  const path = join(scratch, `${name}-${Date.now()}.zip`);
  const script = [
    'import os, sys, zipfile',
    'src, out, name = sys.argv[1], sys.argv[2], sys.argv[3]',
    'with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:',
    '    for base, dirs, files in os.walk(src):',
    '        for f in sorted(files):',
    '            full = os.path.join(base, f)',
    '            z.write(full, name + "/" + os.path.relpath(full, src).replace(os.sep, "/"))',
  ].join('\n');
  execFileSync('python3', ['-I', '-c', script, dir, path, name]);
  return path;
}

export async function createProject(page: Page, name: string): Promise<void> {
  await page.goto('./');
  await showProject(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(openProject(page).getByRole('heading', { name })).toBeVisible();
}

/** A stored project's file as JSON, read from OPFS, or null while it can't be read. */
export function stored(page: Page, folder: string, path: string): Promise<unknown> {
  return page.evaluate(
    async ({ folder, path }) => {
      try {
        let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('projects');
        dir = await dir.getDirectoryHandle(folder);
        const parts = path.split('/');
        const name = parts.pop() as string;
        for (const part of parts) dir = await dir.getDirectoryHandle(part);
        return JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text()) as unknown;
      } catch {
        return null;
      }
    },
    { folder, path },
  );
}

/** A stored project's file as text, read from OPFS, or null while it can't be read: a script or a scene. */
export function storedText(page: Page, folder: string, path: string): Promise<string | null> {
  return page.evaluate(
    async ({ folder, path }) => {
      try {
        let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('projects');
        dir = await dir.getDirectoryHandle(folder);
        const parts = path.split('/');
        const name = parts.pop() as string;
        for (const part of parts) dir = await dir.getDirectoryHandle(part);
        return await (await (await dir.getFileHandle(name)).getFile()).text();
      } catch {
        return null;
      }
    },
    { folder, path },
  );
}

export const kitsBox = (page: Page) => openProject(page).getByRole('group', { name: 'Kits' });

/** A new record of a kit's type, from the Records panel, its form shown in the inspector. */
export async function newRecord(page: Page, type: string, title: string, name: string): Promise<Locator> {
  await showRecords(page);
  await page.getByLabel('Type', { exact: true }).selectOption(type);
  await page.getByRole('button', { name: `New ${title.toLowerCase()}`, exact: true }).click();
  await page.getByLabel(`Name of the new ${title.toLowerCase()}`).fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  const form = page.getByRole('region', { name: `${title} ${name.toLowerCase()}` });
  await expect(form).toBeVisible();
  return form;
}

/** Picks a record in a form's ref field: the field's button, then the option in its dialog. */
export async function pick(
  page: Page,
  scope: Locator,
  field: RegExp,
  dialog: string,
  option: string | RegExp,
): Promise<void> {
  await scope.getByRole('button', { name: field }).click();
  await page.getByRole('dialog', { name: dialog }).getByRole('option', { name: option }).click();
}

export async function showLogic(page: Page): Promise<Locator> {
  await page.getByRole('tab', { name: 'Logic' }).click();
  const panel = page.locator('[data-panel="logic"]');
  await expect(panel.getByRole('heading', { name: 'Trigger sheets' })).toBeVisible();
  return panel;
}
