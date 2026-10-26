/**
 * M6.1's gate (D73, docs/specs/npcs.md#the-gate), what its specs share: the ford brought into the
 * editor and played, what window.__ebWalk says of its NPCs, and an NPC walked up to and faced.
 */
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { game, newGame, showPlay } from './hutScreens.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';
import { drawing, near } from './walkHelpers.ts';

export const FORD = join(import.meta.dirname, '../../../tools/cli/test/fixtures/ford');

/** Where each NPC stands in spaces/ford.json, and the yaw it was placed at. */
export const PLACED = {
  smith: { at: [-3, 0, 8], yaw: 0 },
  ferry: { at: [3, 0, 8], yaw: 180 },
  warden: { at: [0, 0, 1], yaw: 0 },
  drover: { at: [0, 0, 5], yaw: 0 },
} as const;

export interface NpcSeen {
  readonly path: string;
  readonly actor: string;
  readonly drawn: 'model' | 'figure';
  readonly yaw: number;
  readonly placed: number;
}

/** What the walk says of the NPCs built, by their path. */
export async function npcs(page: Page): Promise<Record<string, NpcSeen>> {
  const list = await page.evaluate(() => {
    const hook = (window as unknown as { __ebWalk?: { npcs(): NpcSeen[] } }).__ebWalk;
    return hook ? hook.npcs() : null;
  });
  if (!list) throw new Error('No space is being walked');
  return Object.fromEntries(list.map((n) => [n.path, n]));
}

/** Whether the walk is paused: under the shell's pause, or a screen over its own. */
export const paused = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as { __ebWalk?: { paused: boolean } }).__ebWalk?.paused === true);

/** The yaw from a place that faces another, as the walk measures it: −z is 0°. */
export const yawToward = (from: readonly number[], to: readonly number[]): number =>
  (Math.atan2(-((to[0] as number) - (from[0] as number)), -((to[2] as number) - (from[2] as number))) * 180) / Math.PI;

/** The same yaw, either way round. */
export const sameYaw = (a: number, b: number, by: number): boolean =>
  near(((((a - b) % 360) + 540) % 360) - 180, 0, by);

/** Until the NPC has turned to face where the player stands, or back to its placed yaw. */
export async function turnedTo(page: Page, path: keyof typeof PLACED, yaw: number): Promise<void> {
  await expect
    .poll(async () => sameYaw((await npcs(page))[path]?.yaw ?? Number.NaN, yaw, 1), { timeout: 10_000 })
    .toBe(true);
}

/** The ford imported and open. */
export async function importFord(page: Page, touch = false): Promise<void> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: 'Import zip' })),
  ]);
  await chooser.setFiles(fixtureZip(FORD, 'ford'));
  await expect(openProject(page).getByRole('heading', { name: 'The ford' })).toBeVisible();
}

/** The ford imported, its scripts let run, and a new game of it in Play: the ford drawn. */
export async function openFord(page: Page, touch = false): Promise<Locator> {
  await importFord(page, touch);
  return playFord(page, touch);
}

/** The open ford's scripts let run, and a new game of it in Play: the ford drawn. */
export async function playFord(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  const panel = await showPlay(page);
  await how(panel.getByRole('button', { name: 'Run its scripts' }));
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await how(play);
  await newGame(page, how);
  await expect(hud(page, 0, 1, 0)).toBeVisible();
  return drawing(page, 'ford', 'The ford');
}

/** The HUD's line of who carries the horseshoe: the party, Ada and Bryn. */
export const hud = (page: Page, you: number, ada: number, bryn: number): Locator =>
  game(page).getByText(`Horseshoes: you ${you} · Ada ${ada} · Bryn ${bryn}`);
