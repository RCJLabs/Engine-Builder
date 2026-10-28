/**
 * M7.5's gate (D87, docs/specs/tactics.md#the-gate), what its specs share: the boarding fight brought into the
 * editor and played, what window.__ebStage2d.battle() says of it, and where a tile of the deck is on screen; and
 * a winning line, the crew played by the kit's own AI in Node on the first seed it wins, which a spec plays again
 * through the bar and the deck as a player would. The seed is the Play panel's, so the rolls are the same.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compileWithGame, memorySource } from '@eb/compiler';
import { type Action, createRecordStore, type GameState } from '@eb/core';
import { aiAction, arenaOf, type TacticsSlice } from '@eb/kits';
import { openPack, startPlay } from '@eb/ui/session';
import { expect, type Locator, type Page } from '@playwright/test';
import { game, newGame, showPlay } from './hutScreens.ts';
import { stage2d } from './keepHelpers.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';

export const FIGHT = join(import.meta.dirname, '../../../tools/cli/test/fixtures/fight');

export type Tile = readonly [number, number];

interface Step {
  readonly to: Tile;
  readonly ap: number;
  readonly path: readonly Tile[];
}

interface Shot {
  readonly target: string;
  readonly hit: number;
  readonly crit: number;
}

export interface BattleSeen {
  readonly view?: {
    readonly side: 'crew' | 'foes';
    readonly round: number;
    readonly units: readonly { id: string; side: string; at: Tile; hp: number; status: string; watch: boolean }[];
    readonly choices: readonly { unit: string; moves: readonly Step[]; shots: readonly Shot[]; watch: boolean }[];
  };
  readonly units: readonly { id: string; at: Tile; status: string }[];
  readonly selected?: string;
  readonly preview?: { type: string; unit?: string; to?: Tile; target?: string };
  readonly cursor?: Tile;
  readonly playing: boolean;
  /** An action is on its way, or its beats are: no taps until they are in. */
  readonly waiting: boolean;
  readonly played: number;
  readonly line: string;
  readonly bar: readonly {
    key: string;
    label: string;
    kind: string;
    pressed: boolean;
    box: { x: number; y: number; width: number; height: number };
  }[];
  readonly sent: readonly { action: { type: string }; sent: string }[];
}

export async function battle(page: Page): Promise<BattleSeen | undefined> {
  // biome-ignore lint/suspicious/noExplicitAny: the page's own hook, read as it is
  return page.evaluate(() => (window as any).__ebStage2d?.battle?.());
}

/** The battle once it is the crew's turn and nothing plays back. */
export async function crewTurn(page: Page): Promise<BattleSeen> {
  let seen: BattleSeen | undefined;
  await expect
    .poll(
      async () => {
        seen = await battle(page);
        return seen?.view?.side === 'crew' && !seen.playing && !seen.waiting;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return seen as BattleSeen;
}

/** A tile's centre on the canvas, in CSS pixels from its corner: through the tilemap, the camera and its box. */
export async function tileOnCanvas(page: Page, tile: Tile): Promise<{ x: number; y: number }> {
  return page.evaluate(([c, r]) => {
    // biome-ignore lint/suspicious/noExplicitAny: the page's own hook, read as it is
    const hook = (window as any).__ebStage2d;
    const map = hook.tilemap();
    const { cols, rows } = hook.scaled();
    const [cx, cy] = hook.camera();
    const corner: [number, number] = [Math.round(cx) - Math.floor(cols / 2), Math.round(cy) - Math.floor(rows / 2)];
    const wx = map.at[0] + c * map.tile[0] + map.tile[0] / 2;
    const wy = map.at[1] + (map.size[1] - 1 - r) * map.tile[1] + map.tile[1] / 2;
    const canvas = document.querySelector('.eb-stage2d-canvas') as HTMLCanvasElement;
    const box = canvas.getBoundingClientRect();
    return {
      x: ((wx - corner[0]) / cols) * box.width,
      y: ((rows - (wy - corner[1])) / rows) * box.height,
    };
  }, tile);
}

/** The fight brought into the editor from a zip of its fixture. */
export async function importFight(page: Page, touch = false): Promise<void> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: 'Import zip' })),
  ]);
  await chooser.setFiles(fixtureZip(FIGHT, 'fight'));
  await expect(openProject(page).getByRole('heading', { name: 'The boarding fight' })).toBeVisible();
}

/** A new game of the fight from the title: the deck drawn, some frames on. */
export async function startFight(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await newGame(page, how);
  await expect(game(page).getByText('All quiet aboard.')).toBeVisible();
  const box = page.getByRole('application', { name: 'The boarding fight' });
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

/** The fight imported, its scripts let run, and a new game of it in Play. */
export async function openFight(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await importFight(page, touch);
  const panel = await showPlay(page);
  await how(panel.getByRole('button', { name: 'Run its scripts' }));
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await how(play);
  return startFight(page, touch);
}

/** A click or a tap on a tile of the deck, the canvas brought into view first as a player would scroll to it. */
export async function pressTile(page: Page, tile: Tile, touch = false): Promise<void> {
  const canvas = page.locator('.eb-stage2d-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const position = await tileOnCanvas(page, tile);
  if (touch) await canvas.tap({ position });
  else await canvas.click({ position });
}

/** The bar's button by its key. */
export const barButton = (page: Page, key: string) => page.locator(`.eb-battle-button[data-key="${key}"]`);

function filesOf(root: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files[relative(root, path).split('\\').join('/')] = readFileSync(path);
    }
  };
  walk(root);
  return files;
}

/** The crew's actions, the kit's AI choosing each, on the first seed from 1 up that the crew win. */
export async function winningLine(): Promise<{ seed: string; actions: Action[]; boards: string[] }> {
  const compiled = await compileWithGame(memorySource(filesOf(FIGHT)));
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok || !compiled.pack?.world?.tiles) throw new Error('The fight does not open');
  const tiles = compiled.pack.world.tiles;
  const content = createRecordStore(compiled.pack.records);
  for (let n = 1; n <= 20; n++) {
    const play = startPlay(open.opened.setup, String(n));
    play.act({ type: 'world/use', space: 'deck', object: 'alarm' });
    const actions: Action[] = [];
    const boards: string[] = [];
    for (let i = 0; i < 400; i++) {
      const battle = (play.state as GameState & { tactics: TacticsSlice }).tactics.battle;
      if (!battle) break;
      const move = aiAction(arenaOf(content, tiles, battle.battle), battle);
      const action = { ...move, type: `tactics/${move.type}` } as Action;
      if (!play.act(action).accepted) throw new Error(`Refused ${JSON.stringify(action)}`);
      actions.push(action);
      boards.push(boardOf(play.view.world?.battle?.view?.units ?? []));
    }
    if (play.view.world?.battle?.told.some((b) => b.type === 'tactics/won'))
      return { seed: String(n), actions, boards };
  }
  throw new Error('The crew won none of 20 seeds');
}

/** How a spec presses a tile: stage2d's own deck by default, a stage in code's board by its own reckoning. */
export type PressTile = (page: Page, tile: Tile, touch: boolean) => Promise<void>;

/**
 * One action played as a player would: its unit chosen in the bar; a move by its tile pressed twice on the deck,
 * anything else by its button pressed and then Confirm, or pressed twice; then the crew's turn waited for.
 */
export async function playAction(
  page: Page,
  action: Action,
  touch = false,
  press: PressTile = pressTile,
): Promise<void> {
  const how = (target: Locator) => (touch ? target.tap() : target.click());
  const unit = typeof action.unit === 'string' ? action.unit : undefined;
  if (unit !== undefined) {
    await how(barButton(page, `unit:${unit}`));
    await expect.poll(async () => (await battle(page))?.selected).toBe(unit);
  }
  const verb = action.type.replace('tactics/', '');
  if (verb === 'move') {
    for (let i = 0; i < 2; i++) {
      await press(page, action.to as Tile, touch);
      if (i === 0) await expect.poll(async () => (await battle(page))?.preview).toEqual(action);
    }
  } else {
    const key =
      verb === 'end'
        ? 'end'
        : verb === 'shoot' || verb === 'steady'
          ? `${verb}:${action.target}`
          : verb === 'open'
            ? `open:${action.side}`
            : verb === 'order'
              ? `order:${action.target ?? action.side ?? ''}`
              : verb;
    await how(barButton(page, key));
    await how(barButton(page, 'confirm'));
  }
  await expect
    .poll(async () => (await battle(page))?.sent.at(-1), { timeout: 10_000 })
    .toEqual({ action, sent: 'accepted' });
  await expect
    .poll(
      async () => {
        const seen = await battle(page);
        return !seen?.view || (seen.view.side === 'crew' && !seen.playing && !seen.waiting);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

/** Where every unit stands and how it is, as one line: to tell two games apart. */
export const boardOf = (units: readonly { id: string; at: readonly number[]; hp: number; status: string }[]): string =>
  units.map((u) => `${u.id}@${u.at.join(',')}:${u.hp}:${u.status}`).join(' ');
