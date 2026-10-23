/**
 * What M4.6's specs share (D56): the drift and the valley as fixtures, or with the parts the gate
 * makes taken out; the World panel on any layout; and the drift played on the Play panel's seed to
 * its exit through its map widget, pressing as the drift's unit test presses (driftScreens.test.ts).
 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { game, newGame, press, showPlay, topScreen } from './hutScreens.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, REPO, scratch, showProject } from './ludus.ts';

export const DRIFT = join(REPO, 'tools/cli/test/fixtures/drift');
export const VALLEY = join(REPO, 'tools/cli/test/fixtures/valley');

/** A fixture's file as JSON. */
export const fixtureJson = (dir: string, path: string): unknown => JSON.parse(readFileSync(join(dir, path), 'utf8'));

/** A copy of a fixture without the files the gate makes in the editor. */
export function without(dir: string, paths: readonly string[]): string {
  const copy = join(mkdtempSync(join(scratch, 'fixture-')), 'project');
  cpSync(dir, copy, { recursive: true });
  for (const path of paths) rmSync(join(copy, path));
  return copy;
}

/** A project imported from a folder, as a zip, its heading `title`. */
export async function importFolder(page: Page, dir: string, name: string, title: string): Promise<void> {
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(fixtureZip(dir, name));
  await expect(openProject(page).getByRole('heading', { name: title })).toBeVisible();
}

/** The World panel to the front: its tab, or More's item on a phone. */
export async function showWorld(page: Page): Promise<Locator> {
  const tab = page.getByRole('tab', { name: 'World' });
  if (await tab.isVisible()) await tab.click();
  else {
    await page.getByRole('tab', { name: 'More' }).click();
    await page
      .locator('[data-panel="more"]')
      .getByRole('button', { name: /^World/ })
      .click();
  }
  const panel = page.locator('[data-panel="world"]');
  await expect(panel.getByRole('heading', { name: 'Maps' })).toBeVisible();
  return panel;
}

/** The drift's scripts run, unless the Logic panel ran them, and a game of it started on the Play panel's seed. */
export async function startDrift(page: Page, touch = false): Promise<void> {
  const panel = await showPlay(page);
  const run = panel.getByRole('button', { name: 'Run its scripts' });
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  // Play shows, disabled, beside Run its scripts until they have run: wait for it before asking which.
  await expect(play).toBeVisible();
  if (await run.isVisible()) await run.click();
  // Play waits, disabled, while the scripts run: under a full run's load that is longer than a tap's timeout.
  await expect(play).toBeEnabled({ timeout: 60_000 });
  await play.click();
  await newGame(page, touch ? (b) => b.tap() : (b) => b.click());
  await expect(topScreen(page).getByRole('region', { name: 'The sector' })).toBeVisible();
}

/** The map on the top screen. */
const sector = (page: Page): Locator => topScreen(page).getByRole('region', { name: 'The sector' });

/** The node picked under the map is the party's own: as a game starts, and after every move. */
const expectHerePicked = (page: Page) => expect(sector(page).locator('.eb-map-picked')).toContainText('You are here');

/**
 * As a game starts, before anything is pressed: the party's node picked; where the map runs up a
 * column, the party's node in its view; no two nodes overlapping; and the links drawn behind them.
 */
export async function expectMapLaidOut(page: Page): Promise<void> {
  await expectHerePicked(page);
  const map = sector(page);
  const column = map.locator('.eb-map-column');
  if ((await column.count()) > 0) {
    const [seen, here] = [await column.boundingBox(), await map.locator('[data-here]').boundingBox()];
    if (!seen || !here) throw new Error('No column or no party');
    expect(here.y >= seen.y && here.y + here.height <= seen.y + seen.height, 'the party in the column’s view').toBe(
      true,
    );
  }
  const boxes = await map
    .locator('.eb-map-node')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect()).map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })),
    );
  const overlapping = boxes.flatMap((a, i) =>
    boxes
      .slice(i + 1)
      .filter((b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b)
      .map(() => i),
  );
  expect(overlapping, 'nodes overlapping').toEqual([]);
  expect(await map.locator('.eb-map-links line').count()).toBeGreaterThan(boxes.length - 2);
}

const layerOf = (id: string | null) => Number(/^n(\d+)-/.exec(id ?? '')?.[1] ?? -1);

/**
 * The next press: an event's first open choice; else, in the map's order, the first node a jump
 * takes on a layer, picked and jumped to; else the first move open at all. Undefined at the end.
 */
export async function nextPress(page: Page, touch: boolean): Promise<Locator | undefined> {
  const top = topScreen(page);
  if (await top.getByText('The game is over.').isVisible()) return undefined;
  const dialog = game(page).getByRole('dialog');
  if (await dialog.isVisible()) return dialog.getByRole('listitem').locator('button:enabled').first();
  const map = top.getByRole('region', { name: 'The sector' });
  const here = layerOf(await map.locator('[data-here]').getAttribute('data-node'));
  const reached = map.locator('[data-reached]');
  const moves = map.locator('.eb-map-picked').getByRole('button');
  const tapOrClick = (target: Locator) => (touch ? target.tap() : target.click());
  for (const node of await reached.all()) {
    if (layerOf(await node.getAttribute('data-node')) <= here) continue;
    await tapOrClick(node);
    const jump = moves.filter({ hasText: /^Jump/ });
    if ((await jump.count()) > 0 && (await jump.isEnabled())) return jump;
  }
  for (const node of await reached.all()) {
    await tapOrClick(node);
    const open = map.locator('.eb-map-picked button:enabled');
    if ((await open.count()) > 0) return open.first();
  }
  throw new Error('Nothing to press on the map');
}

export interface Flown {
  readonly presses: number;
  /** The presses made in an event over the map. */
  readonly events: number;
}

/**
 * Plays the drift from its start to its exit, by click or by touch. `atStart` runs as the first jump
 * is picked, its moves under the map; `inEvent` the first time an event is up over it.
 */
export async function flyHome(
  page: Page,
  touch = false,
  checks: { atStart?: () => Promise<void>; inEvent?: () => Promise<void> } = {},
): Promise<Flown> {
  let events = 0;
  const dialog = game(page).getByRole('dialog');
  for (let presses = 0; presses < 80; presses++) {
    const next = await nextPress(page, touch);
    if (!next) return { presses, events };
    if (presses === 0) await checks.atStart?.();
    const inEvent = await dialog.isVisible();
    if (inEvent) {
      if (events === 0) await checks.inEvent?.();
      events++;
    }
    await press(page, next, touch);
    const over = await topScreen(page).getByText('The game is over.').isVisible();
    if (!inEvent && !over && !(await dialog.isVisible())) await expectHerePicked(page);
  }
  throw new Error('The drift didn’t reach its exit in 80 presses');
}
