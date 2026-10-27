// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// What a battle map lets units do, tile by tile and edge by edge, with the
// battle's doors as they are now. mapFromShip.js makes the map, and
// data/tiles.json says what each kind of tile does: whether units stand on
// it, the cover it gives a unit beside it, and whether it blocks sight. On
// the edges, a wall, the hull or a hatch always stands in the way; a door
// does while it is closed, and a unit walking through opens it, unless it
// is welded shut (orders.js, M32).
//
// Of this file the board needs tileRule and edgeAt, for the cover a move's
// preview shows (units.js, through cover.js).
import { cellAt, type Side } from './grid.ts';
import { type BattleMap, edgeKey, wallAt } from './map-from-ship.ts';
import type { Edge } from './map-text.ts';

export interface TileRule {
  walk?: boolean;
  cover?: 'half' | 'full';
  blocksSight?: boolean;
}

export interface Rules {
  tileRules: Record<string, TileRule>;
}

// A battle as these read it: its map and the doors open now.
export interface BattleLike {
  map: BattleMap;
  doors: string[];
}

const NO_RULE: TileRule = {};

// The rules for the tile at (x, y): { walk, cover, blocksSight }. Off the
// map is space.
export function tileRule(battle: BattleLike, x: number, y: number, rules: Rules): TileRule {
  return rules.tileRules[cellAt(battle.map.tiles, x, y) ?? 'space'] ?? NO_RULE;
}

// What stands on the given side of (x, y) now: null for nothing (or an open
// door), else 'wall', 'hull', 'hatch' or 'door' (closed).
export function edgeAt(battle: BattleLike, x: number, y: number, side: Side): Edge | null {
  const edge = wallAt(battle.map, x, y, side);
  return edge === 'door' && battle.doors.includes(edgeKey(x, y, side)) ? null : edge;
}
