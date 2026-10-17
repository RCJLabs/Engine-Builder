/** The ludus fixture (a project made only of data) in the editor, for the forms' tests (M2.4). */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

export const REPO = resolve(import.meta.dirname, '../../..');
export const LUDUS = join(REPO, 'packages/compiler/test/fixtures/ludus');
export const scratch = mkdtempSync(join(tmpdir(), 'eb-e2e-forms-'));

/** The fixture as a zip, made by Python rather than the editor's own code, with `extra` files added. */
export function ludusZip(extra: Record<string, string> = {}): string {
  const path = join(scratch, `ludus-${Object.keys(extra).length}-${Date.now()}.zip`);
  const script = [
    'import json, os, sys, zipfile',
    'src, out, extra = sys.argv[1], sys.argv[2], json.load(sys.stdin)',
    'with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:',
    '    for base, dirs, files in os.walk(src):',
    '        for f in sorted(files):',
    '            full = os.path.join(base, f)',
    '            rel = os.path.relpath(full, src).replace(os.sep, "/")',
    '            if rel not in extra: z.write(full, "ludus/" + rel)',
    '    for rel, text in extra.items(): z.writestr("ludus/" + rel, text)',
  ].join('\n');
  // The extra files go in on stdin: as an argument, a thousand records pass the kernel's limit (E2BIG).
  execFileSync('python3', ['-I', '-c', script, LUDUS, path], { input: JSON.stringify(extra) });
  return path;
}

/** Imports the fixture (with `extra` files) and opens it, from the Project panel on any layout. */
export async function importLudus(page: Page, extra: Record<string, string> = {}): Promise<void> {
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(ludusZip(extra));
  await expect(openProject(page).getByRole('heading', { name: 'Ludus' })).toBeVisible();
}

export const openProject = (page: Page): Locator => page.getByRole('region', { name: 'Open project' });

/** The Project panel to the front, where tabs share a zone (phone, tablet). */
export async function showProject(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: 'Project' });
  if (await tab.isVisible()) await tab.click();
}

/** The Records panel to the front, where tabs share a zone (phone, tablet) or a dock group (desktop). */
export async function showRecords(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: 'Records' });
  if (await tab.isVisible()) await tab.click();
}

/** The Records panel's table of a type, by the type's title ("Gladiator"). */
export const recordsTable = (page: Page, title: string): Locator =>
  page.getByRole('region', { name: `${title} records` });

/** Shows a type's table in the Records panel (the ludus types are named for their titles). */
export async function showTable(page: Page, title: string): Promise<Locator> {
  await showRecords(page);
  await page.getByLabel('Type', { exact: true }).selectOption(title.toLowerCase());
  const table = recordsTable(page, title);
  await expect(table).toBeVisible();
  return table;
}

/** A record's button in its table: named by the record's name, if it has one, then its id. */
export const recordLink = (table: Locator, id: string): Locator =>
  table.getByRole('rowheader').getByRole('button', { name: new RegExp(`(^| )${id}$`) });

/** Opens a record from the Records panel's table; its form shows in the inspector. */
export async function openRecord(page: Page, type: string, id: string): Promise<Locator> {
  await recordLink(await showTable(page, type), id).click();
  const form = page.getByRole('region', { name: `${type} ${id}` });
  await expect(form).toBeVisible();
  return form;
}

/**
 * A file of the stored project as JSON, read from OPFS, or null while it can't be read (the
 * writer's worker holds a file it is writing). Poll it: saves land a second after an edit.
 */
export function stored(page: Page, path: string): Promise<unknown> {
  return page.evaluate(async (path) => {
    try {
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('projects');
      dir = await dir.getDirectoryHandle('ludus');
      const parts = path.split('/');
      const name = parts.pop() as string;
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
      return JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text()) as unknown;
    } catch {
      return null;
    }
  }, path);
}

export const SPICULUS = 'records/gladiator/spiculus.json';
