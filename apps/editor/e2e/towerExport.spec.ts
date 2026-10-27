/**
 * M7.3's gate for exports (D85, docs/specs/rooms.md#the-gate): the tower exported from the editor as one
 * file and opened from file:// offline, as a player would: its building drawn by the stage2d.js inside it,
 * the rooms' sheets with it, and the bell rung, the warden climbing down to the hall. Nothing is asked of
 * the network.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { exportFile } from './exportHelpers.ts';
import { game, showPlay } from './hutScreens.ts';
import { showProject } from './ludus.ts';
import { building, importTower, startTower } from './towerHelpers.ts';

test('the tower as one file plays from the device’s files, its rooms drawn and its folk climbing', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await importTower(page);
  const play = await showPlay(page);
  await play.getByRole('button', { name: 'Run its scripts' }).click();
  await expect(play.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await showProject(page);
  const file = await exportFile(page, 'Export file');
  expect(file).toMatch(/tower-0\.1\.0\.html$/);
  const html = readFileSync(file, 'utf8');
  expect(html).toContain('id="eb-stage2d"');
  expect(html).not.toContain('id="eb-walk"');
  expect(errors).toEqual([]);

  const played = await context.newPage();
  const playedErrors = watchErrors(played);
  const asked: string[] = [];
  played.on('request', (request) => asked.push(request.url()));
  await context.setOffline(true);
  await played.goto(`file://${file}`);
  await expect(played).toHaveTitle('The tower');
  const box = await startTower(played);
  expect((await building(played))?.pieces.filter((p) => p.sprite.startsWith('room-')).length).toBe(7);
  await box.getByRole('button', { name: 'Ring the bell' }).click();
  await expect(game(played).getByText('The bell has rung.')).toBeVisible();
  await expect(game(played).getByText('The warden is in the hall.')).toBeVisible({ timeout: 90_000 });
  expect(
    asked.filter((url) => !url.startsWith('file://') && !url.startsWith('blob:') && !url.startsWith('data:')),
  ).toEqual([]);
  await context.setOffline(false);
  expect(playedErrors).toEqual([]);
});
