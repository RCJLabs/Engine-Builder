/**
 * Proof #2's e2e (M6.10, D82, docs/specs/kaldvik.md#the-gate), what its specs share: Kaldvík as
 * Pages serves it, the web export `pnpm build` writes beside the editor at games/kaldvik/, opened
 * and started, and the routes over the shore that keep clear of what stands. Untested for feel.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { closeOn, type Steer, yawTo } from './campHelpers.ts';
import { newGame } from './hutScreens.ts';
import { agentOf, nav } from './squareHelpers.ts';
import { pressUse } from './templates3dHelpers.ts';
import { drawing, settled, walked } from './walkHelpers.ts';

const EXPORT = resolve(import.meta.dirname, '../dist/games/kaldvik');

/** budgets.json's kaldvik-web: `pnpm budgets` holds the build to the same number. */
export const BUDGET = (
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../budgets.json'), 'utf8')) as {
    sizes: { 'kaldvik-web': { budget: number } };
  }
).sizes['kaldvik-web'].budget;

export function exportBytes(folder = EXPORT): number {
  return readdirSync(folder, { withFileTypes: true }).reduce(
    (sum, entry) =>
      sum + (entry.isDirectory() ? exportBytes(join(folder, entry.name)) : statSync(join(folder, entry.name)).size),
    0,
  );
}

/** Where things stand, by their space's own metres (games/kaldvik/spaces/). */
export const AT = {
  hallDoor: [0, 6, -7.35],
  howeDoor: [62.6, 7, 62.6],
  hallOut: [0, 0, 4.9],
  chest: [0, 0, -5.8],
  howeOut: [0, 0, 6.9],
} as const;

/** Through the gate from the shore to before the hall, north of the drying racks and clear of Halvard. */
export const IN_AT_THE_GATE = [
  [-22, 6, -1.2],
  [-12, 6, -1.2],
] as const;
/** Out of the gate, round the palisade's south side and over the land to the howe's door. */
export const TO_THE_HOWE = [
  [-12, 6, -1.2],
  [-23, 6, -1.2],
  [-28, 4, 4],
  [-28, 3, 26],
  [40, 7, 40],
  [57, 7, 57],
] as const;
/** In the hall from its door, round the east of the long hearth to the high seat. */
export const TO_THE_SEAT = [
  [2, 0, 2.5],
  [2, 0, -2],
] as const;

const across = (a: readonly number[], b: readonly number[]) =>
  Math.hypot((a[0] as number) - (b[0] as number), (a[2] as number) - (b[2] as number));
const shortest = (degrees: number) => (((degrees % 360) + 540) % 360) - 180;

/**
 * Walked to within 1.5 m of each point in turn. A long leg runs 1.5 s between looks, not
 * closeOn's 0.4 s: the shore's legs are up to 70 m, and every look costs a round trip.
 */
export async function goVia(page: Page, steer: Steer, points: readonly (readonly number[])[]): Promise<void> {
  for (const at of points) {
    const started = Date.now();
    for (;;) {
      const me = await walked(page);
      const d = across(me.feet, at);
      if (d <= 1.5) break;
      if (Date.now() - started > 90_000) throw new Error(`Never reached ${at}: ${d.toFixed(1)} m off`);
      const off = shortest(yawTo(me.feet, at) - me.yaw);
      if (Math.abs(off) > 10) await steer.turn(off);
      await steer.walk(d > 12 ? 1500 : d > 4 ? 400 : 150, d > 4);
    }
  }
}

const promptOf = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __ebWalk?: { prompt(): { object: string } | null } }).__ebWalk?.prompt()?.object ?? null,
  );

/**
 * Walked up to `actor` wherever the crowd has them, until their Talk is the prompt offered, then
 * used, pressed again if it missed. A fixed point won't do: the crowd steps an NPC aside as the player
 * comes, and the prompt wants them within 60° of where the player faces (Halvard stood beside the
 * player at 390×844).
 */
export async function talkTo(page: Page, steer: Steer, actor: string, timeout = 60_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    const [prompt, me, seen] = await Promise.all([promptOf(page), walked(page), nav(page)]);
    if (prompt === actor && (await pressUse(page, steer, actor))) return;
    const agent = agentOf(seen, actor);
    if (!agent) throw new Error(`No ${actor} here`);
    if (Date.now() - started > timeout)
      throw new Error(`Never offered ${actor}'s talk: ${across(me.feet, agent.at).toFixed(1)} m off`);
    if (prompt !== actor) await closeOn(steer, me, agent.at, 1.2, 10);
  }
}

/** The export opened from its title, a new game started in Slot 1, and the shore drawn. */
export async function startKaldvik(page: Page, how?: (button: Locator) => Promise<void>): Promise<Locator> {
  await page.goto('games/kaldvik/');
  await expect(page).toHaveTitle('Kaldvík');
  await newGame(page, how);
  await drawing(page, 'shore', 'Kaldvík');
  await settled(page);
  // The walk's view, whichever space it shows: its name is the space's.
  return page.getByRole('application');
}
