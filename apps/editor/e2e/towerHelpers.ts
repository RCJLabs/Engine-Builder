/**
 * M7.3's gate (D85, docs/specs/rooms.md#the-gate), what its specs share: the tower brought into the
 * editor and played, and what window.__ebStage2d says of its building and its folk: the pieces drawn,
 * and each walker's route through the building as floors and x.
 */
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { game, newGame, showPlay } from './hutScreens.ts';
import { stage2d } from './keepHelpers.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';

export const TOWER = join(import.meta.dirname, '../../../tools/cli/test/fixtures/tower');

type Point = readonly [number, number];

export interface BuildingSeen {
  readonly path: string;
  readonly at: Point;
  readonly slot: Point;
  readonly pieces: readonly { sprite: string; of: string; box: { x: number; y: number; w: number; h: number } }[];
}

export interface FolkSeen {
  readonly actor: string;
  readonly at: Point;
  readonly goal?: string;
  readonly moving: boolean;
  readonly floors?: readonly Point[];
}

export async function building(page: Page): Promise<BuildingSeen | undefined> {
  // biome-ignore lint/suspicious/noExplicitAny: the page's own hook, read as it is
  return page.evaluate(() => (window as any).__ebStage2d?.building());
}

export async function folk(page: Page): Promise<readonly FolkSeen[]> {
  // biome-ignore lint/suspicious/noExplicitAny: the page's own hook, read as it is
  return page.evaluate(() => (window as any).__ebStage2d?.walkers() ?? []);
}

/** The tower stands at 112, 16; its floors are 32 high, and its stairs at 12 (floors 0–1, 2–3) and 84 (1–2). */
const AT: Point = [112, 16];
const STAIRS: readonly Point[] = [
  [0, 12],
  [1, 84],
  [2, 12],
];

/** Off a floor's foot only on a stair, between the floors it joins: never through a floor elsewhere. */
export function onFloorOrStair([x, y]: Point): boolean {
  const up = y - AT[1];
  if (Math.abs(up - Math.round(up / 32) * 32) < 0.01) return true;
  const below = Math.floor(up / 32);
  return STAIRS.some(([floor, sx]) => floor === below && Math.abs(AT[0] + sx - x) < 0.01);
}

/** Each step of a route along a floor, or up or down one floor at one x. */
export const climbs = (route: readonly Point[]) =>
  route.every((place, i) => {
    const before = route[i - 1];
    return !before || before[0] === place[0] || (Math.abs(before[0] - place[0]) === 1 && before[1] === place[1]);
  });

/** The tower brought into the editor from a zip of its fixture. */
export async function importTower(page: Page, touch = false): Promise<void> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: 'Import zip' })),
  ]);
  await chooser.setFiles(fixtureZip(TOWER, 'tower'));
  await expect(openProject(page).getByRole('heading', { name: 'The tower' })).toBeVisible();
}

/** Its scripts let run and a new game of it in Play: the tower drawn, some frames on. */
export async function playTower(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  const panel = await showPlay(page);
  await how(panel.getByRole('button', { name: 'Run its scripts' }));
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await how(play);
  return startTower(page, touch);
}

/** A new game of the tower from the title, in Slot 1: the tower drawn, some frames on. */
export async function startTower(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await newGame(page, how);
  await expect(game(page).getByRole('heading', { name: '21:00' })).toBeVisible();
  const box = page.getByRole('application', { name: 'The tower at night' });
  await expect(box).toBeVisible();
  await expect
    .poll(
      () =>
        stage2d(page).then(
          (s) => (s.space === 'tower' ? s.frames : 0),
          () => 0,
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(3);
  return box;
}

/** The tower imported and played. */
export async function openTower(page: Page, touch = false): Promise<Locator> {
  await importTower(page, touch);
  return playTower(page, touch);
}

/** Every walker's place sampled `n` times a frame apart: each on a floor or a stair. */
export async function watchFolk(page: Page, n: number): Promise<string[]> {
  const strays: string[] = [];
  for (let i = 0; i < n; i++) {
    for (const f of await folk(page)) if (!onFloorOrStair(f.at)) strays.push(`${f.actor} at ${f.at.join(', ')}`);
    await page.waitForTimeout(100);
  }
  return strays;
}
