/**
 * M5.10's streaming gate (D72, docs/specs/streaming.md#the-gate), what its specs share: the moor
 * brought into the editor and played, what window.__ebWalk.cells() says it has built and drawn, a
 * record of every ring the walk was in, taken by the page's own frames, and the objects the moor's
 * file puts well inside one row of cells.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { game, newGame, showPlay } from './hutScreens.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';
import { drawing } from './walkHelpers.ts';

export const MOOR = join(import.meta.dirname, '../../../tools/cli/test/fixtures/moor');

/** What src/walk/hook.ts's cells() says. */
export interface Cells {
  readonly cell: readonly [number, number];
  readonly near: readonly string[];
  readonly drawn: readonly string[];
  readonly waiting: number;
  readonly far: { readonly models: number; readonly meshes: number; readonly levels: readonly number[] };
  readonly bodies: number;
  readonly zones: number;
  readonly uses: number;
  readonly view: number;
  readonly farthest: number;
  readonly slowest: number;
}

interface Hooked {
  __ebWalk?: { cells(): Cells };
  __ebRings?: Cells[];
}

export async function cells(page: Page): Promise<Cells> {
  const read = await page.evaluate(() => (window as unknown as Hooked).__ebWalk?.cells() ?? null);
  if (!read) throw new Error('No space is being walked');
  return read;
}

/**
 * Every ring the walk is in from now on, the first frame each is seen: polled from here, a crossing
 * walked at a run could come and go between two polls.
 */
export async function recordRings(page: Page): Promise<() => Promise<Cells[]>> {
  await page.evaluate(() => {
    const seen: Cells[] = [];
    (window as unknown as Hooked).__ebRings = seen;
    const look = () => {
      const now = (window as unknown as Hooked).__ebWalk?.cells();
      const last = seen[seen.length - 1];
      if (now && (!last || last.cell[0] !== now.cell[0] || last.cell[1] !== now.cell[1])) seen.push(now);
      if ((window as unknown as Hooked).__ebRings === seen) requestAnimationFrame(look);
    };
    look();
  });
  return () => page.evaluate(() => [...((window as unknown as Hooked).__ebRings ?? [])]);
}

/** The moor imported, its scripts let run, and a new game of it in Play: the moor drawn. */
export async function openMoor(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: 'Import zip' })),
  ]);
  await chooser.setFiles(fixtureZip(MOOR, 'moor'));
  await expect(openProject(page).getByRole('heading', { name: 'The moor' })).toBeVisible({ timeout: 60_000 });
  const panel = await showPlay(page);
  await how(panel.getByRole('button', { name: 'Run its scripts' }));
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled({ timeout: 60_000 });
  await how(play);
  await newGame(page, how);
  await expect(game(page).getByText('Walk the road north to the cairn.')).toBeVisible({ timeout: 60_000 });
  return drawing(page, 'moor', 'The moor');
}

/** The ids of the moor's objects placed well inside the row of cells from z `from` to `to`, and the columns from x `left` to `right`. */
export function placedIn(from: number, to: number, left: number, right: number): string[] {
  const space = JSON.parse(readFileSync(join(MOOR, 'spaces/moor.json'), 'utf8')) as {
    objects: { id: string; at?: [number, number, number] }[];
  };
  return space.objects
    .filter((o) => {
      const [x, , z] = o.at ?? [0, 0, 0];
      return z > from + 8 && z < to - 8 && x > left + 8 && x < right - 8;
    })
    .map((o) => o.id);
}
