/**
 * The Project panel (M2.1) on real OPFS in Chromium: projects that survive a reload, zips in and
 * out byte for byte, a folder opened and copied in, and the phone layouts. Each test gets a fresh
 * browser context, so a fresh, empty OPFS.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { readFixture } from '../../../packages/compiler/test/fixture.ts';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const FIXTURE = join(REPO, 'packages/compiler/test/fixtures/v1');
const FIXTURE_HASH = '489cedf323bd33d9';
const scratch = mkdtempSync(join(tmpdir(), 'eb-e2e-projects-'));

/** The fixture zipped the way an OS does it: a top folder, folder entries, and the junk macOS adds. */
function osZip(): string {
  const path = join(scratch, 'salvage-run.zip');
  const script = [
    'import os, sys, zipfile',
    'src, out = sys.argv[1], sys.argv[2]',
    'with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:',
    '    for base, dirs, files in os.walk(src):',
    '        rel = os.path.relpath(base, src)',
    '        top = "salvage-run" if rel == "." else "salvage-run/" + rel.replace(os.sep, "/")',
    '        z.writestr(top + "/", "")',
    '        for f in sorted(files): z.write(os.path.join(base, f), top + "/" + f)',
    '    z.writestr("salvage-run/.DS_Store", "junk")',
    '    z.writestr("__MACOSX/salvage-run/._project.json", "junk")',
  ].join('\n');
  execFileSync('python3', ['-I', '-c', script, FIXTURE, path]);
  return path;
}

/** A zip's files as `{ path: text }`, unpacked by Python, not by the editor's own code. */
function unzipped(path: string): Record<string, string> {
  const script =
    'import json, sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); print(json.dumps({n: z.read(n).decode() for n in z.namelist()}))';
  return JSON.parse(execFileSync('python3', ['-I', '-c', script, path], { encoding: 'utf8' }));
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('region', { name: 'Open project' }).getByRole('heading', { name })).toBeVisible();
}

/** Answers the browser's file picker, opened by the Import button or the palette, with a file. */
async function pickFile(page: Page, path: string, open: () => Promise<void>): Promise<void> {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open()]);
  await chooser.setFiles(path);
}

const rows = (page: Page) => page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');

test.describe('projects, desktop 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('keeps a new project through a reload, and deletes it', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await createProject(page, 'Dirtbag Valley');
    await page.getByRole('button', { name: 'Close' }).click();
    await page.reload();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('dirtbag-valley · 0.1.0');
    await rows(page).first().getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('button', { name: 'Keep' })).toBeFocused();
    await rows(page).first().getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No projects yet.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('imports a zip and exports the same files, which the CLI reads to the same hash', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await pickFile(page, osZip(), () => page.getByRole('button', { name: 'Import zip' }).click());
    const open = page.getByRole('region', { name: 'Open project' });
    await expect(open.getByRole('heading', { name: 'Salvage Run' })).toBeVisible();
    await expect(open).toContainText('4 records in 3 types');
    await expect(open).toContainText('No problems found.');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      open.getByRole('button', { name: 'Export zip' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('salvage-run-0.1.0.zip');
    const exported = join(scratch, 'exported.zip');
    await download.saveAs(exported);
    const expected = Object.fromEntries(
      Object.entries(readFixture(FIXTURE)).map(([path, text]) => [`salvage-run/${path}`, text]),
    );
    expect(unzipped(exported)).toEqual(expected);
    const cli = ['tools/cli/src/cli.ts', 'validate', exported, '--types', 'packages/compiler/test/fixtures/types.ts'];
    expect(execFileSync('node', cli, { cwd: REPO, encoding: 'utf8' })).toContain(`hash ${FIXTURE_HASH}`);
    expect(errors).toEqual([]);
  });

  test('says so when a file isn’t a zip, picked from the palette', async ({ page }) => {
    await page.goto('./');
    const notZip = join(scratch, 'notes.zip');
    writeFileSync(notZip, 'not a zip at all');
    // The palette closes before the picker opens: a modal dialog leaves the input outside it inert.
    await pickFile(page, notZip, async () => {
      await page.keyboard.press('Control+k');
      await page.keyboard.type('import zip');
      await page.keyboard.press('Enter');
    });
    // Scoped to the panel: on desktop the dock keeps a live region of its own with the alert role.
    await expect(page.locator('[data-panel="project"]').getByRole('alert')).toHaveText(
      'notes.zip isn’t a zip this editor can read.',
    );
    await expect(page.getByText('No projects yet.')).toBeVisible();
  });

  test('opens a folder, copies it in, and remembers it after a reload', async ({ page }) => {
    // The native picker can't be driven, so it hands back an OPFS folder holding the fixture.
    await page.addInitScript(() => {
      (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle('salvage-run');
    });
    const errors = watchErrors(page);
    await page.goto('./');
    await page.evaluate(async (files) => {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('salvage-run', { create: true });
      for (const [path, text] of Object.entries(files)) {
        const parts = path.split('/');
        const name = parts.pop() as string;
        let dir = root;
        for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
        const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await writable.write(text);
        await writable.close();
      }
    }, readFixture(FIXTURE));

    await page.getByRole('button', { name: 'Open folder' }).click();
    const open = page.getByRole('region', { name: 'Open project' });
    await expect(open).toContainText('Opened from the folder salvage-run.');
    await expect(open).toContainText('4 records in 3 types');
    await open.getByRole('button', { name: 'Copy into this browser' }).click();
    await expect(open).toContainText('Stored in this browser.');
    await open.getByRole('button', { name: 'Close' }).click();
    await expect(rows(page)).toHaveCount(1);

    await page.reload();
    const recent = page.getByRole('list', { name: 'Recent folders' }).getByRole('listitem');
    await expect(recent).toHaveCount(1);
    await recent.first().getByRole('button', { name: 'Open' }).click();
    await expect(open).toContainText('Opened from the folder salvage-run.');
    expect(errors).toEqual([]);
  });

  // Playwright's offline mode doesn't reach a dedicated worker's script, which loads from the
  // server anyway (seen with the writer left out of the cache). So the cache itself is checked.
  test('works offline: every script the build made is cached, the writer included', async ({ page, context }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const cached = await page.evaluate(async () => {
      const paths: string[] = [];
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) paths.push(new URL(request.url).pathname);
      }
      return paths;
    });
    const scripts = readdirSync(join(REPO, 'apps/editor/dist/assets')).filter((file) => file.endsWith('.js'));
    expect(scripts.some((file) => file.startsWith('opfs.worker-'))).toBe(true);
    for (const script of scripts) expect(cached, script).toContain(`/assets/${script}`);

    await context.setOffline(true);
    await page.reload();
    await createProject(page, 'Offline Project');
    await context.setOffline(false);
    expect(errors).toEqual([]);
  });
});

for (const [width, height] of [
  [360, 740],
  [390, 844],
  [844, 390],
] as const) {
  test.describe(`projects, phone ${width}×${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true, colorScheme: 'dark' });

    test('fits the panel on screen, with 44 px targets, while confirming a delete', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      const tab = page.getByRole('tab', { name: 'Project' });
      if (await tab.isVisible()) await tab.tap();
      await createProject(page, 'A Long Project Name That Has To Wrap On A Small Phone');
      await page.getByRole('button', { name: 'Close' }).tap();
      await page.getByRole('button', { name: 'New project' }).tap();
      await rows(page).first().getByRole('button', { name: 'Delete' }).tap();
      await expect(page.getByRole('button', { name: 'Keep' })).toBeVisible();
      await expectNothingOffscreen(page);
      expect(await smallTargets(page, '[data-panel="project"]'), 'touch targets under 44 px').toEqual([]);
      await expectNoAxeIssues(page);
      expect(errors).toEqual([]);
    });
  });
}
