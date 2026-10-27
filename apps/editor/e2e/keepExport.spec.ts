/**
 * M7.1's gate for exports (D83, docs/specs/2d-scenes.md#the-gate): the keep exported from the editor
 * as one file and as a web build, each opened as a player would and played offline to the bell rung:
 * the one file from file:// with stage2d.js inside it, the web build from its service worker's cache
 * with stage2d.js beside the page. Neither carries walk.js or nav.js: the keep has no 3D space.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { exportFile, serveSite, unzipTo } from './exportHelpers.ts';
import { game, showPlay } from './hutScreens.ts';
import { importKeep, stage2d, startKeep } from './keepHelpers.ts';
import { scratch, showProject } from './ludus.ts';

/** The keep imported, its scripts let run, and the Project panel at the front for Export. */
async function keepToExport(page: Page): Promise<void> {
  await importKeep(page);
  const play = await showPlay(page);
  await play.getByRole('button', { name: 'Run its scripts' }).click();
  await expect(play.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await showProject(page);
}

/** A new game of the exported keep, drawn by stage2d.js, and its bell rung by a click. */
async function ringTheBell(played: Page): Promise<void> {
  const box = await startKeep(played);
  expect(await played.evaluate(() => ({ walk: '__ebWalkStage' in window, nav: '__ebNav' in window }))).toEqual({
    walk: false,
    nav: false,
  });
  await box.getByRole('button', { name: 'Ring the bell' }).click();
  await expect(game(played).getByText('The watch has rung the bell.')).toBeVisible();
  expect((await stage2d(played)).used).toEqual([{ path: 'bell', sent: 'accepted' }]);
}

test('the keep as one file plays from the device’s files, stage2d.js inside it', async ({ page, context }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await keepToExport(page);
  const file = await exportFile(page, 'Export file');
  expect(file).toMatch(/keep-0\.1\.0\.html$/);
  const html = readFileSync(file, 'utf8');
  expect(html).toContain('id="eb-stage2d"');
  expect(html).not.toContain('id="eb-walk"');
  expect(html).not.toContain('id="eb-nav"');
  expect(errors).toEqual([]);

  const played = await context.newPage();
  const playedErrors = watchErrors(played);
  const asked: string[] = [];
  played.on('request', (request) => asked.push(request.url()));
  await context.setOffline(true);
  await played.goto(`file://${file}`);
  await expect(played).toHaveTitle('The keep');
  await ringTheBell(played);
  // Nothing but the file itself and what it makes in the page.
  expect(
    asked.filter((url) => !url.startsWith('file://') && !url.startsWith('blob:') && !url.startsWith('data:')),
  ).toEqual([]);
  await context.setOffline(false);
  expect(playedErrors).toEqual([]);
});

test('the keep’s web build plays offline once visited, stage2d.js from the cache', async ({ page, context }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await keepToExport(page);
  const dir = join(scratch, `keep-web-${Date.now()}`);
  const files = unzipTo(await exportFile(page, 'Export web'), dir);
  const stageFile = files.find((f) => /^stage2d\.[0-9a-f]{8}\.js$/.test(f));
  expect(stageFile).toBeDefined();
  expect(files.filter((f) => /^(walk|nav)\./.test(f))).toEqual([]);
  expect(errors).toEqual([]);
  const site = await serveSite(dir, '/keep/');
  try {
    const played = await context.newPage();
    const playedErrors = watchErrors(played);
    await played.goto(site.url);
    await expect(played).toHaveTitle('The keep');
    await expect.poll(() => played.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    // The first visit draws nothing yet: stage2d.js came with the service worker's install.
    expect(site.asked).toContain(`/keep/${stageFile}`);
    await context.setOffline(true);
    await played.reload();
    await ringTheBell(played);
    await context.setOffline(false);
    expect(playedErrors).toEqual([]);
  } finally {
    await site.close();
  }
});
