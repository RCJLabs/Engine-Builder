/**
 * Pressing on: the foes' player when a battle says they came to fight (M7.5, D87; from space-wrecked's
 * src/sim/press.js). For the first unit with an ap left: with a foe in its sight it plays as the AI would;
 * with none, it walks toward the nearest, as far as one ap takes it; with nowhere nearer, it opens a shut
 * door beside it. Left to the AI alone, two sides either side of a shut door each wait for the other.
 */
import { SIDES, type Tile, tileKey } from '@eb/core';
import { aiAction } from './ai.ts';
import { type Arena, active, fieldOf, foesOf, reachOf, same, sees, shutDoor, stepsAway } from './field.ts';
import type { Battle, Move, Unit } from './types.ts';

export function pressAction(arena: Arena, battle: Battle): Move {
  const unit = battle.units.find((u) => u.side === battle.side && active(u) && u.ap > 0);
  if (!unit) return { type: 'end' };
  const grid = fieldOf(arena, battle);
  if (foesOf(battle, unit).some((u) => sees(arena, grid, unit.at, u.at))) return aiAction(arena, battle);
  return advance(arena, battle, unit) ?? aiAction(arena, battle);
}

/** A move toward the nearest foe, as far as one ap takes it, or a shut door beside it opened. Null with neither. */
export function advance(arena: Arena, battle: Battle, unit: Unit): Move | null {
  const away = stepsAway(
    arena,
    battle,
    foesOf(battle, unit).map((u) => u.at),
  );
  const far = (tile: Tile) => away.get(tileKey(tile)) ?? Number.POSITIVE_INFINITY;
  let best = { d: far(unit.at), cost: 0, tile: unit.at as Tile };
  for (const spot of reachOf(arena, battle, unit, unit.mobility).values()) {
    const d = far(spot.tile);
    if (d < best.d || (d === best.d && spot.cost < best.cost)) best = { d, cost: spot.cost, tile: spot.tile };
  }
  if (!same(best.tile, unit.at)) return { type: 'move', unit: unit.id, to: best.tile };
  const door = SIDES.find((side) => shutDoor(arena, battle, unit.at, side));
  return door ? { type: 'open', unit: unit.id, side: door } : null;
}
