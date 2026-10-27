/**
 * M7.2's gate (D84, docs/specs/tilemaps.md#the-gate), what its specs share: the boarding deck brought
 * into the editor and played, and what window.__ebStage2d says of its tilemap and its crew: each
 * layer's frame at each cell as drawn, and each walker's route as tiles.
 */
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { game, newGame, showPlay } from './hutScreens.ts';
import { stage2d } from './keepHelpers.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';

export const DECK = join(import.meta.dirname, '../../../tools/cli/test/fixtures/deck');

type Point = readonly [number, number];

export interface TilemapSeen {
  readonly path: string;
  readonly size: Point;
  readonly tile: Point;
  readonly at: Point;
  readonly frames: readonly (readonly (readonly number[])[])[];
}

export interface WalkerSeen {
  readonly actor: string;
  readonly at: Point;
  readonly goal?: string;
  readonly moving: boolean;
  readonly route?: readonly Point[];
}

export async function tilemap(page: Page): Promise<TilemapSeen | undefined> {
  // biome-ignore lint/suspicious/noExplicitAny: the page's own hook, read as it is
  return page.evaluate(() => (window as any).__ebStage2d?.tilemap());
}

export async function walkers(page: Page): Promise<readonly WalkerSeen[]> {
  // biome-ignore lint/suspicious/noExplicitAny: the page's own hook, read as it is
  return page.evaluate(() => (window as any).__ebStage2d?.walkers() ?? []);
}

/** The deck brought into the editor from a zip of its fixture. */
export async function importDeck(page: Page, touch = false): Promise<void> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: 'Import zip' })),
  ]);
  await chooser.setFiles(fixtureZip(DECK, 'deck'));
  await expect(openProject(page).getByRole('heading', { name: 'The boarding deck' })).toBeVisible();
}

/** Its scripts let run and a new game of it in Play: the deck drawn, some frames on. */
export async function playDeck(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  const panel = await showPlay(page);
  await how(panel.getByRole('button', { name: 'Run its scripts' }));
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await how(play);
  return startDeck(page, touch);
}

/** A new game of the deck from the title, in Slot 1: the deck drawn, some frames on. */
export async function startDeck(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await newGame(page, how);
  await expect(game(page).getByRole('heading', { name: '08:00' })).toBeVisible();
  const box = page.getByRole('application', { name: 'The boarding deck' });
  await expect(box).toBeVisible();
  await expect
    .poll(
      () =>
        stage2d(page).then(
          (s) => (s.space === 'deck' ? s.frames : 0),
          () => 0,
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(3);
  return box;
}

/** The deck imported and played. */
export async function openDeck(page: Page, touch = false): Promise<Locator> {
  await importDeck(page, touch);
  return playDeck(page, touch);
}

/** Each step of a route one tile north, east, south or west. */
export const fourWay = (route: readonly Point[]) =>
  route.every(
    (tile, i) =>
      i === 0 || Math.abs(tile[0] - (route[i - 1] as Point)[0]) + Math.abs(tile[1] - (route[i - 1] as Point)[1]) === 1,
  );
