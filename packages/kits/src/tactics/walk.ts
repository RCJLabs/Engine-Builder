/**
 * A unit's move, walked a tile at a time (M7.5, D87, docs/specs/tactics.md#the-rules-in-the-engine; from
 * space-wrecked's src/sim/battle.js move and walk). Doors open as it passes, and every foe on overwatch who
 * sees the tile it steps onto fires once, in the order set out, unless an ally of the mover's lies there. A
 * mover that falls stays where it fell. The walk is told as legs, a `moved` for each stretch between doors
 * and shots.
 */
import { edgeKey, sideToward, type Tile, tileKey } from '@eb/core';
import { type Arena, active, apFor, budgetOf, fieldOf, type Rolls, reachOf, same, sees } from './field.ts';
import { fire } from './fire.ts';
import type { Battle, Told, Unit } from './types.ts';

/** Moves a unit to a tile it can reach with its ap. Returns why not, or null. */
export function move(arena: Arena, battle: Battle, unit: Unit, to: unknown, told: Told[], rolls: Rolls): string | null {
  const tile = tileOf(to);
  if (!tile) return 'A move needs a tile to go to.';
  if (same(tile, unit.at)) return `${unit.id} is there already.`;
  const spot = reachOf(arena, battle, unit, budgetOf(unit)).get(tileKey(tile));
  if (!spot) return `${unit.id} can't get to (${tile[0]}, ${tile[1]}) this turn.`;
  unit.ap -= apFor(unit, spot.cost);
  walk(arena, battle, unit, spot.path, told, rolls);
  return null;
}

/** A tile as an action names it: two whole numbers. */
export function tileOf(value: unknown): Tile | undefined {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isInteger)) return undefined;
  return [value[0] as number, value[1] as number];
}

function walk(arena: Arena, battle: Battle, unit: Unit, path: readonly Tile[], told: Told[], rolls: Rolls): void {
  let leg: Tile[] = [path[0] as Tile];
  const tell = () => {
    if (leg.length > 1) told.push({ type: 'moved', unit: unit.id, path: leg });
    leg = [leg.at(-1) as Tile];
  };
  for (let i = 1; i < path.length; i++) {
    const [from, to] = [path[i - 1] as Tile, path[i] as Tile];
    const side = sideToward(from, to);
    const key = edgeKey(from, side);
    if (arena.grid.edge(from[0], from[1], side) === 'door' && !battle.doors.includes(key)) {
      tell();
      battle.doors = [...battle.doors, key].sort();
      told.push({ type: 'opened', unit: unit.id, at: from, side });
    }
    unit.at = [to[0], to[1]];
    leg.push(to);
    const shared = battle.units.some((u) => u !== unit && u.status !== 'dead' && same(u.at, to));
    for (const watcher of shared ? [] : battle.units) {
      if (watcher.side === unit.side || !active(watcher) || !watcher.watch) continue;
      if (!sees(arena, fieldOf(arena, battle), watcher.at, to)) continue;
      tell();
      watcher.watch = false;
      fire(arena, battle, watcher, unit, true, told, rolls);
      if (!active(unit)) break;
    }
    if (!active(unit)) break;
  }
  tell();
}
