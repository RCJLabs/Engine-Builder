/**
 * M7.4's gate for exports (D86, docs/specs/stages.md#the-gate): the boarding deck exported from the
 * editor as one file and opened from file:// offline, as a player would: drawn by its stage in the
 * worker stage2d.js carries inside the page, the stage's code and the HUD's SVG in the pack, the
 * alarm sounded. Nothing is asked of the network.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { code, importBoarding, SOUNDING, startBoarding } from './boardingHelpers.ts';
import { watchErrors } from './checks.ts';
import { exportFile } from './exportHelpers.ts';
import { game, showPlay } from './hutScreens.ts';
import { showProject } from './ludus.ts';

test('the boarding deck as one file plays from the device’s files, drawn by its stage', async ({ page, context }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await importBoarding(page);
  const play = await showPlay(page);
  await play.getByRole('button', { name: 'Run its scripts' }).click();
  await expect(play.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await showProject(page);
  const file = await exportFile(page, 'Export file');
  expect(file).toMatch(/boarding-0\.1\.0\.html$/);
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
  const box = await startBoarding(played);
  expect(await code(played)).toMatchObject({ stage: 'battle', boxed: ['alarm'], unboxed: [] });
  await box.getByRole('button', { name: 'Sound the alarm' }).click();
  await expect(game(played).getByText(SOUNDING)).toBeVisible();
  const hud = game(played).getByRole('img', { name: 'The alarm' });
  await expect.poll(() => hud.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(24);
  expect(
    asked.filter((url) => !url.startsWith('file://') && !url.startsWith('blob:') && !url.startsWith('data:')),
  ).toEqual([]);
  await context.setOffline(false);
  expect(playedErrors).toEqual([]);
});
