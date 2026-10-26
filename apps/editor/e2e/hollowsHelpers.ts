/**
 * M6.7's gate (D79, docs/specs/radiant.md#the-gate), what its specs share: the hollows brought into
 * the editor and played, and the board read until it has no run left.
 */
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { acted } from './glenHelpers.ts';
import { game, newGame, showPlay } from './hutScreens.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';
import { shown } from './markerHelpers.ts';
import { drawing } from './walkHelpers.ts';

export const HOLLOWS = join(import.meta.dirname, '../../../tools/cli/test/fixtures/hollows');

/** A project's zip imported, its name's heading seen. */
export async function importZip(page: Page, zip: string, name: string, touch = false): Promise<void> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: 'Import zip' })),
  ]);
  await chooser.setFiles(zip);
  await expect(openProject(page).getByRole('heading', { name })).toBeVisible();
}

/** The open project's scripts let run, and a new game of it in Play: the green drawn. */
export async function playHollows(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  const panel = await showPlay(page);
  await how(panel.getByRole('button', { name: 'Run its scripts' }));
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await how(play);
  await newGame(page, how);
  await expect(game(page).getByText('Read the board, or the post.')).toBeVisible();
  return drawing(page, 'green', 'The green');
}

/** The hollows imported and a new game of it in Play. */
export async function openHollows(page: Page, touch = false): Promise<Locator> {
  await importZip(page, fixtureZip(HOLLOWS, 'hollows'), 'The hollows', touch);
  return playHollows(page, touch);
}

/** Each marker's objective and the door it stands at, or null inside the target's space. */
export async function markedAt(page: Page): Promise<unknown[]> {
  return (await shown(page)).map((m) => [m.objective, m.door ?? null]);
}

/** Until the markers stand at these. */
export async function marksAt(page: Page, want: readonly unknown[]): Promise<void> {
  await expect.poll(() => markedAt(page), { timeout: 20_000 }).toEqual(want);
}

/** What the sim made of the walk's last use of `object`. */
export async function lastUse(page: Page, object: string): Promise<string | undefined> {
  return (await acted(page)).used.filter((u) => u.object === object).at(-1)?.sent;
}
