/**
 * M5.8's gate for exports (D70, docs/specs/movement.md#exports): the trail exported from the editor
 * as one file and as a web build, each opened as a player would and walked to the cairn offline:
 * the one file from file:// with walk.js inside it, the web build from its service worker's cache
 * with walk.js beside the page.
 */
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { exportFile, serveSite, unzipTo } from './exportHelpers.ts';
import { game, newGame, showPlay } from './hutScreens.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, scratch, showProject } from './ludus.ts';
import { drawing, holdUntil, TRAIL, walked } from './walkHelpers.ts';

/** The trail imported into the editor and its scripts let run, the Project panel at the front for Export. */
async function importTrail(page: Page): Promise<void> {
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(fixtureZip(TRAIL, 'trail'));
  await expect(openProject(page).getByRole('heading', { name: 'The trail' })).toBeVisible();
  const play = await showPlay(page);
  await play.getByRole('button', { name: 'Run its scripts' }).click();
  await expect(play.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await showProject(page);
}

/** A new game of the exported trail, run up the path until the cairn's zone takes its trigger. */
async function walkToCairn(played: Page): Promise<void> {
  await newGame(played);
  const box = await drawing(played, 'trailhead', 'The trailhead');
  await box.focus();
  await holdUntil(played, ['ShiftLeft', 'KeyW'], (w) => w.zones.includes('cairn/zone'), 60_000);
  await expect(game(played).getByText('The cairn is reached.')).toBeVisible();
  expect((await walked(played)).sent).toEqual([{ object: 'cairn/zone', sent: 'accepted' }]);
}

test('the trail as one file walks from the device’s files, walk.js inside it', async ({ page, context }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await importTrail(page);
  const file = await exportFile(page, 'Export file');
  expect(file).toMatch(/trail-0\.1\.0\.html$/);
  expect(errors).toEqual([]);

  const played = await context.newPage();
  const playedErrors = watchErrors(played);
  const asked: string[] = [];
  played.on('request', (request) => asked.push(request.url()));
  await context.setOffline(true);
  await played.goto(`file://${file}`);
  await expect(played).toHaveTitle('The trail');
  await walkToCairn(played);
  // Nothing but the file itself and what it makes in the page.
  expect(
    asked.filter((url) => !url.startsWith('file://') && !url.startsWith('blob:') && !url.startsWith('data:')),
  ).toEqual([]);
  await context.setOffline(false);
  expect(playedErrors).toEqual([]);
});

test('the trail’s web build walks offline once visited, walk.js from the cache', async ({ page, context }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await importTrail(page);
  const dir = join(scratch, `trail-web-${Date.now()}`);
  const files = unzipTo(await exportFile(page, 'Export web'), dir);
  const walkFile = files.find((f) => /^walk\.[0-9a-f]{8}\.js$/.test(f));
  expect(walkFile).toBeDefined();
  expect(errors).toEqual([]);
  const site = await serveSite(dir, '/trail/');
  try {
    const played = await context.newPage();
    const playedErrors = watchErrors(played);
    await played.goto(site.url);
    await expect(played).toHaveTitle('The trail');
    await expect.poll(() => played.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    // The first visit draws nothing yet: walk.js came with the service worker's install.
    expect(site.asked).toContain(`/trail/${walkFile}`);
    await context.setOffline(true);
    await played.reload();
    await walkToCairn(played);
    await context.setOffline(false);
    expect(playedErrors).toEqual([]);
  } finally {
    await site.close();
  }
});
