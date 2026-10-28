/**
 * M7.5's demo by machine (D87, docs/specs/tactics.md#a-stage-in-code): the boarding deck's battle as its stage
 * draws it. A tile's place on the page is worked out as the stage works it, from the stage's own files compiled
 * from the fixture: Space-Wrecked's camera fitted to the box above the bar, a tile's middle projected through it.
 * That holds while the board has not been turned since the box last changed size. And the kit AI's winning line:
 * the deck walked headless to its battle as the page walks it, the crew played by the AI on the first seed it wins.
 */
import { compileWithGame, memorySource } from '@eb/compiler';
import type { Action } from '@eb/core';
import { aiAction, arenaOf, type TacticsSlice } from '@eb/kits';
import { loadStage } from '@eb/script/stage-load';
import { expect, type Page } from '@playwright/test';
import { standInCanvas } from '../../../tools/cli/test/standInCanvas.ts';
import { BOARDING, filesOf, inBattle, openBoarding as openHeadless, toBattle } from '../test/boardingWalk.ts';
import { battle, boardOf, type Tile } from './fightHelpers.ts';

type Pair = [number, number];

interface Board {
  readonly tilemap: unknown;
  readonly tileset: unknown;
  readonly load: <T>(file: string) => T;
}

let board: Promise<Board> | undefined;

/** The fixture compiled once, its stage's files loadable here as the stage's worker loads them. */
function boardOnce(): Promise<Board> {
  board ??= compileWithGame(memorySource(filesOf(BOARDING))).then(({ pack }) => {
    const world = pack?.world;
    if (!world) throw new Error('The boarding deck does not compile');
    const stages = new Map(Object.entries(world.stages ?? {}));
    const api = { defineStage: (s: unknown) => s, svg: () => Promise.reject(new Error('No SVG here')) };
    const space = world.spaces.deck as { objects: { id: string; components?: { tilemap?: unknown } }[] };
    return {
      tilemap: space.objects.find((o) => o.id === 'deck')?.components?.tilemap,
      tileset: world.records['tileset:deck'],
      load: <T>(file: string) => loadStage(stages, file, api) as T,
    };
  });
  return board;
}

/** Where a tile's middle is on the board, in CSS pixels from the canvas's corner. */
export async function tileOnBoard(page: Page, tile: Tile): Promise<{ x: number; y: number }> {
  const { tilemap, tileset, load } = await boardOnce();
  const canvas = page.locator('.eb-stage-canvas');
  const size = await canvas.evaluate((el) => ({ w: el.clientWidth, h: el.clientHeight }));
  const inset = ((await battle(page)) as { inset?: number } | undefined)?.inset ?? 0;
  const Canvas = standInCanvas([]);
  const had = (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = Canvas;
  try {
    const { deckBoard } = load<{ deckBoard(t: unknown, s: unknown): { map: { origin: Pair } } }>('deck/battle-map');
    const { battleBoxes } = load<{ battleBoxes(map: unknown): unknown }>('space-wrecked/render/battle-scene');
    const { createCamera } = load<{
      createCamera(boxes: unknown): { frame(f: unknown): { cam: unknown } };
    }>('deck/camera');
    const { project } = load<{ project(cam: unknown, x: number, y: number, z?: number): number[] }>(
      'space-wrecked/render/orbit',
    );
    const { map } = deckBoard(tilemap, tileset);
    const { cam } = createCamera(battleBoxes(map)).frame({
      t: 0,
      w: size.w,
      h: Math.max(1, size.h - inset),
      input: [],
    });
    const [x, y] = project(cam, tile[0] - map.origin[0] + 0.5, tile[1] - map.origin[1] + 0.5, 0);
    return { x: x as number, y: y as number };
  } finally {
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = had;
  }
}

/** A click or a tap on a tile of the board, the canvas brought into view first. */
export async function pressBoard(page: Page, tile: Tile, touch = false): Promise<void> {
  const canvas = page.locator('.eb-stage-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const position = await tileOnBoard(page, tile);
  if (touch) await canvas.tap({ position });
  else await canvas.click({ position });
}

/** The alarm sounded and the crew's first turn of the battle, once Ines and Oren have walked to their posts. */
export async function toBoarders(page: Page, how: 'click' | 'tap' = 'click'): Promise<void> {
  const alarm = page.getByRole('application', { name: 'The boarding deck' }).getByRole('button', {
    name: 'Sound the alarm',
  });
  await (how === 'tap' ? alarm.tap() : alarm.click());
  await expect
    .poll(
      async () => {
        const seen = await battle(page);
        return seen?.view?.side === 'crew' && !seen.playing && !seen.waiting;
      },
      { timeout: 60_000 },
    )
    .toBe(true);
}

/** The crew's actions, the kit's AI choosing each, on the first seed from 1 up that the crew win. */
export async function boardingLine(): Promise<{ seed: string; actions: Action[]; boards: string[] }> {
  const headless = await openHeadless();
  const { content } = headless.opened.setup.sim;
  for (let n = 1; n <= 20; n++) {
    const { play } = toBattle(headless, String(n));
    const actions: Action[] = [];
    const boards: string[] = [];
    for (let i = 0; i < 400 && inBattle(play); i++) {
      const fought = (play.state as unknown as { tactics: TacticsSlice }).tactics.battle;
      if (!fought) break;
      const move = aiAction(arenaOf(content, headless.world.tiles ?? {}, fought.battle), fought);
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
