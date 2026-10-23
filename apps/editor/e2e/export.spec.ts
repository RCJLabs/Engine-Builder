/**
 * M4.10's gate (D60), on desktop: the hut exported from the editor to each target and played by
 * machine. The single file from file://, with its saves; the itch.io zip from a folder path; the web
 * build served as Pages serves it, its service worker taking it offline and offering the next
 * build on the title; Publish's repository with its workflows; and a taster edition whose leak
 * check finds the map it leaves out when a script names it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { exportFile, exportReport, exportSection, importHut, serveSite, unzipTo } from './exportHelpers.ts';
import { fixtureText } from './hutHelpers.ts';
import { replaceText } from './hutLogic.ts';
import { game, newGame, press, shellScreens, topScreen } from './hutScreens.ts';
import { newRecord, showLogic, storedText } from './kitHelpers.ts';
import { scratch, showProject } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 900 }, actionTimeout: 20_000 });

/** The hut's title, then a new game and one load carried: the game plays. */
async function playALoad(page: Page): Promise<void> {
  await expect(shellScreens(page).getByRole('heading', { name: 'The hut' })).toBeVisible();
  await newGame(page);
  await expect(game(page).getByText(/^Day 0 of 10$/)).toBeVisible();
  await press(page, topScreen(page).getByRole('button', { name: 'Carry a load up' }));
}

test('the hut exported as one file plays from the device’s files, and keeps its saves', async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await importHut(page);
  const file = await exportFile(page, 'Export file');
  expect(file).toMatch(/the-hut-0\.1\.0\.html$/);
  expect(errors).toEqual([]);

  const played = await context.newPage();
  const playedErrors = watchErrors(played);
  await played.goto(`file://${file}`);
  await expect(played).toHaveTitle('The hut');
  await playALoad(played);
  await played.reload();
  await shellScreens(played).getByRole('button', { name: 'Continue' }).click();
  await expect(game(played).getByText(/^Day \d+ of 10$/)).toBeVisible();
  expect(playedErrors).toEqual([]);
});

/** Waits until the page's service worker controls it: from then on it plays offline. */
async function controlled(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

test('the web build, served at a path: offline after its first visit, the next build offered on its title', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await importHut(page);
  const first = join(scratch, `web-${Date.now()}`);
  const files = unzipTo(await exportFile(page, 'Export web'), first);
  expect(files).toEqual(expect.arrayContaining(['index.html', 'sw.js', 'version.json', 'manifest.webmanifest']));
  const site = await serveSite(first, '/hut/');
  try {
    const played = await context.newPage();
    const playedErrors = watchErrors(played);
    await played.goto(site.url);
    await expect(played).toHaveTitle('The hut');
    await controlled(played);
    await playALoad(played);

    await test.step('offline, it opens and plays from its cache', async () => {
      await context.setOffline(true);
      await played.reload();
      await shellScreens(played).getByRole('button', { name: 'Continue' }).click();
      await press(played, topScreen(played).getByRole('button', { name: 'Carry a load up' }));
      await context.setOffline(false);
    });

    await test.step('a new build, deployed, is offered on the title and taken', async () => {
      await exportSection(page).getByRole('button', { name: 'Set up export' }).click();
      await exportSection(page)
        .getByRole('textbox', { name: 'Name (optional)', exact: true })
        .fill('The hut at the col');
      await expect.poll(() => storedText(page, 'the-hut', 'export.json')).toContain('"name": "The hut at the col"');
      const next = join(scratch, `web-${Date.now()}-next`);
      unzipTo(await exportFile(page, 'Export web'), next);
      site.serve(next);
      await played.reload();
      const offer = shellScreens(played).getByRole('button', { name: 'Reload to update' });
      await expect(offer).toBeVisible({ timeout: 20_000 });
      await offer.click();
      await expect(played).toHaveTitle('The hut at the col');
      await controlled(played);
    });
    expect(site.asked).toContain('/hut/sw.js');
    expect(playedErrors).toEqual([]);
  } finally {
    await site.close();
  }
  expect(errors).toEqual([]);
});

test('the itch.io zip plays from a folder of its own, with no service worker', async ({ page, context }) => {
  test.setTimeout(120_000);
  await importHut(page);
  const dir = join(scratch, `itch-${Date.now()}`);
  const files = unzipTo(await exportFile(page, 'Export for itch.io'), dir);
  expect(files.filter((f) => !f.startsWith('game.'))).toEqual(['icons/favicon.png', 'index.html']);
  const site = await serveSite(dir, '/html/4242/');
  try {
    const played = await context.newPage();
    const playedErrors = watchErrors(played);
    await played.goto(`${site.url}index.html`);
    await playALoad(played);
    expect(await played.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
    expect(site.asked.filter((p) => p.endsWith('sw.js'))).toEqual([]);
    expect(playedErrors).toEqual([]);
  } finally {
    await site.close();
  }
});

/** The Problems panel to the front. */
async function showProblems(page: Page): Promise<Locator> {
  await page.getByRole('tab', { name: /^Problems/ }).click();
  return page.locator('[data-panel="problems"]');
}

/** The script editor's region for scripts/<id>.ts, opened from the Logic panel's list. */
async function openScript(page: Page, id: string): Promise<Locator> {
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: new RegExp(`^${id}\\.ts`) }).click();
  const region = page.getByRole('region', { name: `Script ${id}.ts` });
  await expect(region.locator('.cm-content')).toBeVisible();
  return region;
}

test('a taster that leaves out a map of the summit: E055 while it is named, a clean build, and a leak found', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await importHut(page);
  await newRecord(page, 'item', 'Item', 'summit-map');
  await showProject(page);
  const section = exportSection(page);
  await section.getByRole('button', { name: 'Set up export' }).click();

  await test.step('a taster edition, leaving out the map, which the single file ships', async () => {
    await section.getByLabel('New key for Editions').fill('taster');
    await section.getByRole('button', { name: 'Add to Editions' }).click();
    await section.getByRole('button', { name: 'Add Leave out' }).click();
    await section.getByRole('button', { name: 'Add to Records' }).click();
    await section.getByRole('button', { name: /^Records, item 1/ }).click();
    await page.getByRole('dialog').getByRole('option', { name: 'summit-map (item)' }).click();
    await section
      .getByRole('group', { name: 'Single file (optional)' })
      .getByRole('combobox', { name: 'Edition (optional)' })
      .selectOption('taster');
    await expect.poll(() => storedText(page, 'the-hut', 'export.json')).toContain('"edition": "taster"');
  });

  await test.step('E055 while a kept record names what it leaves out', async () => {
    await section.getByRole('button', { name: 'Add to Records' }).click();
    await section.getByRole('button', { name: /^Records, item 2/ }).click();
    await page.getByRole('dialog').getByRole('option', { name: 'rope (item)' }).click();
    const problems = await showProblems(page);
    await expect(problems.getByText('Names item:rope, which the taster edition leaves out').first()).toBeVisible();
    await showProject(page);
    await section.getByRole('button', { name: 'Remove Records item 2' }).click();
    await expect(section.getByRole('button', { name: 'Export file' })).toBeEnabled();
  });

  await test.step('the taster as one file: the map isn’t in it, and the check says so', async () => {
    const file = await exportFile(page, 'Export file');
    expect(file).toMatch(/the-hut-0\.1\.0-taster\.html$/);
    await expect(exportReport(page)).toContainText(
      'The leak check read 1 file of the taster build for 1 thing it leaves out: none there, and every one found in the full build.',
    );
    const played = await context.newPage();
    await played.goto(`file://${file}`);
    await playALoad(played);
    const items = await played.evaluate(() =>
      Object.keys(JSON.parse(document.getElementById('eb-game')?.textContent ?? '{}').pack.records.item),
    );
    expect(items).toContain('rope');
    expect(items).not.toContain('summit-map');
    await played.close();
  });

  await test.step('a script that names the map: the leak check finds it, and nothing is saved', async () => {
    const script = await openScript(page, 'hut');
    await replaceText(page, script, `${fixtureText('scripts/hut.ts')}\nexport const secret = 'summit-map';\n`);
    await expect.poll(() => storedText(page, 'the-hut', 'scripts/hut.ts')).toContain('secret');
    await showProject(page);
    let downloads = 0;
    page.on('download', () => downloads++);
    await section.getByRole('button', { name: 'Export file' }).click();
    await expect(exportReport(page)).toContainText(
      'Nothing was saved: the single file would hold what the taster edition leaves out.',
    );
    await expect(exportReport(page)).toContainText(
      'The taster build holds summit-map (item:summit-map) in the-hut-0.1.0-taster.html',
    );
    expect(downloads).toBe(0);
  });
  expect(errors).toEqual([]);
});

test('Publish to GitHub: a repository with the web build, its Pages workflow and the Android app’s', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await importHut(page);
  const section = exportSection(page);
  await section.getByRole('button', { name: 'Set up export' }).click();
  const web = section.getByRole('group', { name: 'Web (optional)' });
  await web.getByRole('textbox', { name: 'Domain (optional)' }).fill('hut.example.com');
  await section.getByRole('button', { name: 'Add Android' }).click();
  const android = section.getByRole('group', { name: 'Android (optional)' });
  await android.getByRole('textbox', { name: 'Package', exact: true }).fill('com.rcjlabs.thehut');
  await android.getByRole('button', { name: 'Add to Key fingerprints' }).click();
  await android.getByRole('textbox', { name: /Key fingerprints/ }).fill(`${'AB:'.repeat(31)}CD`);
  await expect.poll(() => storedText(page, 'the-hut', 'export.json')).toContain('AB:AB');
  const dir = join(scratch, `repo-${Date.now()}`);
  const files = unzipTo(await exportFile(page, 'Publish to GitHub'), dir);
  expect(files.filter((f) => !f.startsWith('site/'))).toEqual([
    '.github/workflows/android.yml',
    '.github/workflows/pages.yml',
    'README.md',
    'twa-manifest.json',
    'twa/package.json',
  ]);
  expect(files).toEqual(expect.arrayContaining(['site/index.html', 'site/sw.js', 'site/.well-known/assetlinks.json']));
  const read = (path: string) => readFileSync(join(dir, path), 'utf8');
  expect(JSON.parse(read('twa-manifest.json'))).toMatchObject({
    packageId: 'com.rcjlabs.thehut',
    host: 'hut.example.com',
  });
  expect(JSON.parse(read('site/.well-known/assetlinks.json'))[0].target.package_name).toBe('com.rcjlabs.thehut');
  expect(read('.github/workflows/pages.yml')).toContain('include-hidden-files: true');
  expect(read('README.md')).toContain('https://hut.example.com/');
});
