/**
 * A battle on stage2d's own drawer (M7.5, D87, docs/specs/tactics.md#the-stage): the controller started for a
 * space with a tilemap, a tap or a click on the canvas turned into the tile under it (a drag still pans), the
 * arrows, Enter and Escape taken while the stage itself has focus, and the battle drawn over the space each
 * frame. The uses' buttons are hidden while a battle is fought, so the bar's are all there is to reach.
 */
import type { PackTiles, PackWorld } from '@eb/core';
import type { SpaceAsk } from '@eb/ui';
import { type Point, viewCorner } from '../stage2d/camera.ts';
import type { Sheets } from '../stage2d/draw.ts';
import { tileUnder } from '../stage2d/tilemap2d.ts';
import type { View2d } from '../stage2d/view.ts';
import { type Battle2d, createBattle2d } from './controller.ts';
import { drawBattle } from './draw.ts';

/** How far a press may wander, in CSS pixels, and still be a tap rather than a drag. */
const TAP_SLOP = 8;

export interface OnStage {
  /** Before the space is drawn: the view fitted to what the bar leaves, so the board is never under it. */
  fit(): void;
  /** After the space is drawn: the battle over it. */
  draw(now: number, t: number): void;
  hook(): unknown;
  stop(): void;
}

export function battleOnStage(
  box: HTMLElement,
  view: View2d,
  ask: SpaceAsk,
  world: PackWorld,
  sheets: Sheets,
  tiles: PackTiles,
  fighting: (on: boolean) => void,
): OnStage | undefined {
  if (!ask.battle) return undefined;
  const record = (key: string) => (Object.hasOwn(world.records, key) ? world.records[key] : undefined);
  const actor = (id: string) => record(`actor:${id}`) as { name?: string; sprite?: string } | undefined;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const battle: Battle2d = createBattle2d({
    box,
    battle: () => ask.battle?.(),
    send: (action) => ask.send(action),
    tiles,
    actorName: (id) => actor(id)?.name,
    still,
    fighting,
  });

  const corner = (): Point => {
    const { cols, rows } = view.scaled();
    return viewCorner(view.camera(), [cols, rows]);
  };
  let press: { id: number; x: number; y: number } | null = null;
  let kept = 0;
  const down = (e: PointerEvent) => {
    press = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const up = (e: PointerEvent) => {
    if (!press || press.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    press = null;
    if (moved > TAP_SLOP) return;
    const rect = view.canvas.getBoundingClientRect();
    const { cols, rows } = view.scaled();
    const art: Point = [((e.clientX - rect.left) / rect.width) * cols, ((e.clientY - rect.top) / rect.height) * rows];
    const [x0, y0] = corner();
    const tile = tileUnder(tiles, [x0 + art[0], y0 + (rows - art[1])]);
    if (tile) battle.tapTile(tile);
  };
  const key = (e: KeyboardEvent) => {
    if (e.target !== box && e.target !== view.canvas) return;
    if (!battle.key(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  view.canvas.addEventListener('pointerdown', down);
  view.canvas.addEventListener('pointerup', up);
  box.addEventListener('keydown', key);

  return {
    // Before the space is drawn: a canvas sized again is cleared, so not between the space and the battle.
    fit() {
      // The room kept only grows while a battle lasts, so the board isn't fitted again at every press.
      const bar = battle.barHeight();
      kept = bar === 0 ? 0 : Math.max(kept, bar);
      view.inset(kept);
    },
    draw(now, t) {
      const fight = battle.frame(now);
      if (!fight) return;
      const { picking } = fight;
      const chosen = fight.view.choices.find((c) => c.unit === picking.selected);
      drawBattle(view.ctx, {
        tiles,
        corner: corner(),
        rows: view.scaled().rows,
        sheets,
        spriteOf: (id) => actor(id)?.sprite,
        units: fight.view.units,
        shown: fight.units,
        reach: fight.playing ? [] : (chosen?.moves ?? []),
        ...(picking.selected !== undefined ? { selected: picking.selected } : {}),
        ...(picking.preview ? { preview: picking.preview } : {}),
        ...(picking.cursor ? { cursor: picking.cursor } : {}),
        ...(fight.shot ? { shot: fight.shot } : {}),
        t,
        still,
      });
    },
    hook: () => battle.hook(),
    stop() {
      view.canvas.removeEventListener('pointerdown', down);
      view.canvas.removeEventListener('pointerup', up);
      box.removeEventListener('keydown', key);
      battle.stop();
    },
  };
}
