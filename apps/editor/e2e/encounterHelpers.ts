/**
 * What M4.7's specs share (D57): the pit as a fixture beside the drift; a copy of a fixture with
 * files left out or written otherwise, for the gate to make again with forms; the drift flown
 * from the Play panel's seed to its first hostile ship, pressing as the M4.6 specs press; and the
 * odds its Fight shows there, at full hull, which driftScreens.test.ts holds to the sim's.
 */
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { game, press, topScreen } from './hutScreens.ts';
import { REPO, scratch } from './ludus.ts';
import { nextPress } from './mapHelpers.ts';

export const PIT = join(REPO, 'tools/cli/test/fixtures/pit');

/** A copy of a fixture with some files left out and others written as given. */
export function changed(dir: string, out: readonly string[], written: Readonly<Record<string, unknown>> = {}): string {
  const copy = join(mkdtempSync(join(scratch, 'fixture-')), 'project');
  cpSync(dir, copy, { recursive: true });
  for (const path of out) rmSync(join(copy, path));
  for (const [path, value] of Object.entries(written))
    writeFileSync(join(copy, path), `${JSON.stringify(value, null, 2)}\n`);
  return copy;
}

/** The hostile ship's Fight and Run in close, as they read at full hull (driftScreens.test.ts). */
export const HAILED = [
  'Win 67%, 0–10 Hull lost, Credits 12 → 24 · Draw 16%, 0–12 Hull lost, 0–1 fall, heat 15 → 20 · Lose 17%, 12 Hull lost, 1 falls, Supplies 36 → 33, heat 15 → 25',
  'Win 88%, 0–9 Hull lost, Credits 12 → 24 · Draw 7%, 12 Hull lost, 1 falls, heat 15 → 20 · Lose 5%, 12 Hull lost, 1 falls, Supplies 36 → 33, heat 15 → 25',
] as const;

/** The event open over the map. */
export const hailing = (page: Page): Locator => game(page).getByRole('dialog');

/** Presses on as the map specs do until the first hostile ship hails the drift; how many presses. */
export async function flyToHostile(page: Page, touch = false): Promise<number> {
  for (let presses = 0; presses < 40; presses++) {
    if (await hailing(page).getByRole('heading', { name: 'Hostile ship' }).isVisible()) return presses;
    const next = await nextPress(page, touch);
    if (!next) break;
    await press(page, next, touch);
  }
  throw new Error('No hostile ship hailed the drift');
}

/** The hostile ship's choices, each a button with its odds as its second line. */
export async function expectHailedOdds(page: Page): Promise<void> {
  const choices = hailing(page).getByRole('listitem').getByRole('button');
  await expect(choices.nth(0).locator('.eb-button-label')).toHaveText('Fight');
  await expect(choices.nth(0).locator('.eb-button-detail')).toHaveText(HAILED[0]);
  await expect(choices.nth(1).locator('.eb-button-detail')).toHaveText(HAILED[1]);
  // Choices whose outcomes the event doesn't roll show no second line.
  await expect(choices.nth(2).locator('.eb-button-detail')).toHaveCount(0);
  await expect(topScreen(page)).toBeVisible();
}
