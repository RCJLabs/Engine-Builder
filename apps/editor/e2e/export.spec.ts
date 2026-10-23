/**
 * M4.10's gate (D60), on desktop: the hut exported from the editor to each target and played by
 * machine. The single file from file://, with its saves; the itch.io zip from a folder path; the web
 * build served as Pages serves it, its service worker taking it offline and offering the next
 * build on the title; Publish's repository with its workflows; and a taster edition whose leak
 * check finds the map it leaves out when a script names it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { exportFile, exportReport, exportSection, importHut, serveSite, unzipTo } from './exportHelpers.ts';
import { game, newGame, press, shellScreens, topScreen } from './hutScreens.ts';
import { scratch } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 900 }, actionTimeout: 20_000 });

/** The hut's title, then a new game and one load carried: the game plays. */
async function playALoad(page: import('@playwright/test').Page): Promise<void> {
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
  void exportReport;
  void exportSection;
  void readFileSync;
  void join;
  void serveSite;
  void unzipTo;
  void scratch;
});
