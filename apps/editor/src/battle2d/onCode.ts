/**
 * A battle on a stage in code (M7.5, D87, docs/specs/tactics.md#a-stage-in-code): the same controller and bar as
 * stage2d's own drawer, the board drawn by the stage from Frame.battle and a tap's tile told back by Drew.picked.
 * The arrows, Enter and Escape reach the battle before the stage, taken on the box as they come down; with Shift
 * or another key held they are the stage's (the controller leaves them), so a board the arrows turn still turns.
 */
import type { PackTiles, PackWorld } from '@eb/core';
import type { SpaceAsk } from '@eb/ui';
import type { Pair, StageBattle } from '../stagecode/api.ts';
import { createBattle2d } from './controller.ts';
import { stageBattleOf } from './forStage.ts';

export interface OnCode {
  /** Each animation frame: the battle for the stage's next frame, or none. */
  frame(now: number): StageBattle | undefined;
  /** The tile the stage says a tap landed on. */
  picked(tile: Pair): void;
  hook(): unknown;
  stop(): void;
}

export function battleOnCode(
  box: HTMLElement,
  canvas: HTMLElement,
  ask: SpaceAsk,
  world: PackWorld,
  tiles: PackTiles,
  fighting: (on: boolean) => void,
): OnCode | undefined {
  if (!ask.battle) return undefined;
  const record = (key: string) => (Object.hasOwn(world.records, key) ? world.records[key] : undefined);
  const battle = createBattle2d({
    box,
    battle: () => ask.battle?.(),
    send: (action) => ask.send(action),
    tiles,
    actorName: (id) => (record(`actor:${id}`) as { name?: string } | undefined)?.name,
    still: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    fighting,
  });
  const key = (e: KeyboardEvent) => {
    if (e.target !== box && e.target !== canvas) return;
    if (!battle.key(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  box.addEventListener('keydown', key, { capture: true });
  // As stage2d's: the room kept only grows while a battle lasts, so the board isn't fitted again at every press.
  let kept = 0;
  return {
    frame(now) {
      const fight = battle.frame(now);
      const bar = battle.barHeight();
      kept = bar === 0 ? 0 : Math.max(kept, bar);
      return fight ? stageBattleOf(fight, kept) : undefined;
    },
    picked: (tile) => battle.tapTile([tile[0], tile[1]]),
    // The controller's, and the room kept for the bar: where the stage fits its board.
    hook: () => ({ ...(battle.hook() as object), inset: kept }),
    stop() {
      box.removeEventListener('keydown', key, { capture: true });
      battle.stop();
    },
  };
}
