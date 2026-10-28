/**
 * M7.4's gate (D86, docs/specs/stages.md#the-gate), what its specs share: the boarding deck, drawn by
 * Space-Wrecked's battle board as a stage, brought into the editor and played; what
 * window.__ebStage2d.code() says of the stage; and where the alarm's button stands, which moves with
 * the board's camera, the one thing of the camera the page can see.
 */
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { game, newGame, showPlay } from './hutScreens.ts';
import { coloursIn } from './keepHelpers.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';

export const BOARDING = join(import.meta.dirname, '../../../tools/cli/test/fixtures/boarding');
export const QUIET = 'All quiet aboard.';
export const SOUNDING = 'The alarm is sounding.';
/** Space-Wrecked's deep space and its yard's floors (stages/space-wrecked/render/palette.ts). */
export const SPACE = ['#070a14', '#071226'];
export const FLOORS = ['#28344e', '#2c3955', '#253048', '#2f3c59'];

const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
/** Each channel within `by` of one of `targets`: the board lights its faces, so a floor is a shade off its palette's. */
const near = (hex: string, targets: readonly string[], by: number) =>
  targets.some((t) => rgb(t).every((c, i) => Math.abs(c - (rgb(hex)[i] as number)) <= by));

/**
 * The canvas in Space-Wrecked's colours: its deep space and its yard's lit floors (2026-10-27 at 1280:
 * about 0.4 and 0.2 of the canvas), and none of it the engine's own sixteen-colour drawing.
 */
export async function expectBoardColours(page: Page, canvas: Locator): Promise<void> {
  const colours = await coloursIn(page, canvas);
  const shown = [...colours.values()].reduce((sum, n) => sum + n, 0);
  const share = (targets: readonly string[], by: number) =>
    [...colours].reduce((sum, [hex, n]) => sum + (near(hex, targets, by) ? n : 0), 0) / shown;
  const space = share(SPACE, 10);
  const floors = share(FLOORS, 8);
  console.info(`boarding colours: ${colours.size}, space ${space.toFixed(3)}, floors ${floors.toFixed(3)}`);
  expect(space).toBeGreaterThan(0.1);
  expect(floors).toBeGreaterThan(0.05);
  expect(colours.size).toBeGreaterThan(64);
}

export interface CodeSeen {
  readonly stage: string;
  readonly frames: number;
  readonly ms: number;
  readonly boxed: readonly string[];
  readonly unboxed: readonly string[];
  readonly error?: string;
}

export async function code(page: Page): Promise<CodeSeen | undefined> {
  // biome-ignore lint/suspicious/noExplicitAny: the page's own hook, read as it is
  return page.evaluate(() => (window as any).__ebStage2d?.code?.());
}

/** The boarding deck brought into the editor from a zip of its fixture. */
export async function importBoarding(page: Page, touch = false): Promise<void> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: 'Import zip' })),
  ]);
  await chooser.setFiles(fixtureZip(BOARDING, 'boarding'));
  await expect(openProject(page).getByRole('heading', { name: 'The boarding deck' })).toBeVisible();
}

/** A new game from the title, in Slot 1: the stage drawing, the alarm's button boxed. */
export async function startBoarding(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await newGame(page, how);
  await expect(game(page).getByRole('heading', { name: '08:00' })).toBeVisible();
  const box = page.getByRole('application', { name: 'The boarding deck' });
  await expect(box).toBeVisible();
  await expect
    .poll(
      async () => {
        const seen = await code(page);
        return seen ? { stage: seen.stage, drawing: seen.frames > 3, error: seen.error } : null;
      },
      { timeout: 30_000 },
    )
    .toEqual({ stage: 'battle', drawing: true, error: undefined });
  await expect(box.getByRole('button', { name: 'Sound the alarm' })).toBeVisible();
  return box;
}

/** Its scripts let run and a new game of it in Play. */
export async function openBoarding(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await importBoarding(page, touch);
  const panel = await showPlay(page);
  await how(panel.getByRole('button', { name: 'Run its scripts' }));
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await how(play);
  return startBoarding(page, touch);
}

export type Rect = { x: number; y: number; width: number; height: number };

export async function rectOf(target: Locator): Promise<Rect> {
  const rect = await target.boundingBox();
  if (!rect) throw new Error('Not shown');
  return rect;
}

/** Waits for the alarm's button to stand somewhere else than `before`: the board has turned, panned or zoomed. */
export async function moved(alarm: Locator, before: Rect): Promise<Rect> {
  let after = before;
  await expect
    .poll(async () => {
      after = await rectOf(alarm);
      return Math.abs(after.x - before.x) + Math.abs(after.y - before.y) + Math.abs(after.width - before.width);
    })
    .toBeGreaterThan(4);
  return after;
}
