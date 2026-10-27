/**
 * M7.2's gate for exports (D84, docs/specs/tilemaps.md#the-gate): the boarding deck exported from the
 * editor as one file and opened from file:// offline, as a player would: its tilemap drawn by the
 * stage2d.js inside it, the tileset's sheet with it, and the alarm sounded, the crew routed to the
 * airlock. Nothing is asked of the network.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { importDeck, startDeck, tilemap } from './deckHelpers.ts';
import { exportFile } from './exportHelpers.ts';
import { game, showPlay } from './hutScreens.ts';
import { showProject } from './ludus.ts';

test('the deck as one file plays from the device’s files, its tiles drawn and its crew routed', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await importDeck(page);
  const play = await showPlay(page);
  await play.getByRole('button', { name: 'Run its scripts' }).click();
  await expect(play.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await showProject(page);
  const file = await exportFile(page, 'Export file');
  expect(file).toMatch(/deck-0\.1\.0\.html$/);
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
  await expect(played).toHaveTitle('The boarding deck');
  const box = await startDeck(played);
  expect((await tilemap(played))?.size).toEqual([11, 5]);
  await box.getByRole('button', { name: 'Sound the alarm' }).click();
  await expect(game(played).getByText('The alarm is sounding.')).toBeVisible();
  await expect(game(played).getByText('Ines can see the hatch.')).toBeVisible({ timeout: 90_000 });
  expect(
    asked.filter((url) => !url.startsWith('file://') && !url.startsWith('blob:') && !url.startsWith('data:')),
  ).toEqual([]);
  await context.setOffline(false);
  expect(playedErrors).toEqual([]);
});
