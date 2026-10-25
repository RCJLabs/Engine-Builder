/**
 * M6.3's gate (D75, docs/specs/ai.md#the-gate), what its specs share: the village brought into the
 * editor and played, the HUD's clock and what each NPC is doing, and what window.__ebWalk says of the
 * clock and the guard's senses.
 */
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { game, newGame, showPlay } from './hutScreens.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';
import { nav } from './squareHelpers.ts';
import { drawing } from './walkHelpers.ts';

export const VILLAGE = join(import.meta.dirname, '../../../tools/cli/test/fixtures/village');
/** spaces/village.json's guard, at the gate and facing out (−z), and the spawn inside it. */
export const GUARD_AT = [0, 0, -14] as const;
export const HALT = "Halt. You're walking about like you own the place.";
export const LEAVING = "I'm just leaving";

/** The HUD's clock, as "10:00". */
export async function clockOf(page: Page): Promise<string> {
  const text = await game(page)
    .getByRole('heading', { name: /^\d\d:\d\d$/ })
    .textContent();
  return text?.trim() ?? '';
}

/** The HUD's line on Ada and Bram: "Ada: work · Bram: work, unaware". */
export async function doingOf(page: Page): Promise<string> {
  return (
    (await game(page)
      .getByText(/^Ada: /)
      .textContent()) ?? ''
  ).trim();
}

/** What the walk says of the guard's senses: each ai/sensed sent and what the sim made of it. */
export interface SensesSeen {
  readonly sent: readonly {
    readonly npcs: Readonly<Record<string, { seen?: number[]; heard?: number }>>;
    readonly sent: string;
  }[];
}

export async function senses(page: Page): Promise<SensesSeen> {
  const seen = await page.evaluate(
    () => (window as unknown as { __ebWalk?: { senses(): unknown } }).__ebWalk?.senses() ?? null,
  );
  if (!seen) throw new Error('Nothing senses in the space walked');
  return seen as SensesSeen;
}

/** The village brought into the editor from a zip of it: the fixture's own, unless one is given. */
export async function importVillage(page: Page, touch = false, zip = fixtureZip(VILLAGE, 'village')): Promise<void> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: 'Import zip' })),
  ]);
  await chooser.setFiles(zip);
  await expect(openProject(page).getByRole('heading', { name: 'The village' })).toBeVisible();
}

/** Its scripts let run, and a new game of it in Play: the village drawn, its navmesh open. */
export async function playVillage(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  const panel = await showPlay(page);
  await how(panel.getByRole('button', { name: 'Run its scripts' }));
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await how(play);
  await newGame(page, how);
  await expect(game(page).getByRole('heading', { name: '10:00' })).toBeVisible();
  const box = await drawing(page, 'village', 'The village');
  await expect
    .poll(
      () =>
        nav(page).then(
          (n) => n.navmesh.polygons,
          () => 0,
        ),
      { timeout: 30_000 },
    )
    .toBe(134);
  return box;
}

/** The village imported and played. */
export async function openVillage(page: Page, touch = false): Promise<Locator> {
  await importVillage(page, touch);
  return playVillage(page, touch);
}
