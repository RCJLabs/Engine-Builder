/**
 * M7.5's gate for exports (D87, docs/specs/tactics.md#the-gate): the boarding fight exported from the editor as
 * one file and opened from file:// offline, as a player would: the deck drawn by the stage2d.js inside it, the
 * alarm sounded, a move by two clicks on the deck and the crew's turn ended, the boarders coming on. Nothing is
 * asked of the network.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { exportFile } from './exportHelpers.ts';
import { barButton, battle, crewTurn, importFight, pressTile, startFight } from './fightHelpers.ts';
import { game, showPlay } from './hutScreens.ts';
import { showProject } from './ludus.ts';

test('the boarding fight as one file plays from the device’s files, a turn fought by the bar and the deck', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await importFight(page);
  const play = await showPlay(page);
  await play.getByRole('button', { name: 'Run its scripts' }).click();
  await expect(play.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await showProject(page);
  const file = await exportFile(page, 'Export file');
  expect(file).toMatch(/fight-0\.1\.0\.html$/);
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
  await expect(played).toHaveTitle('The boarding fight');
  await startFight(played);
  await played.getByRole('button', { name: 'Sound the alarm' }).click();
  const seen = await crewTurn(played);
  await expect(game(played).getByText('Round 1', { exact: true })).toBeVisible();
  const step = seen.view?.choices.find((c) => c.unit === 'c1')?.moves.find((m) => m.ap === 1);
  if (!step) throw new Error('Ines can reach nowhere');
  await pressTile(played, step.to);
  await pressTile(played, step.to);
  expect((await crewTurn(played)).sent.at(-1)?.sent).toBe('accepted');
  await barButton(played, 'end').click();
  await barButton(played, 'confirm').click();
  const after = await crewTurn(played);
  expect(after.view?.round).toBe(2);
  expect((await battle(played))?.played).toBeGreaterThan(seen.played);
  expect(
    asked.filter((url) => !url.startsWith('file://') && !url.startsWith('blob:') && !url.startsWith('data:')),
  ).toEqual([]);
  await context.setOffline(false);
  expect(playedErrors).toEqual([]);
});
