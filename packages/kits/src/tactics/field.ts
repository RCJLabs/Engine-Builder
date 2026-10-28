/**
 * The ground a battle is fought on (M7.5, D87, docs/specs/tactics.md#the-rules-in-the-engine): the space's
 * tilemap with the battle's doors laid over it, who sees whom, cover, and where a unit can walk. From
 * space-wrecked's src/sim/terrain.js, sight.js and moves.js; the grid itself is core's (M7.2).
 */
import {
  type Cover,
  coverFrom,
  edgeKey,
  type Holder,
  lineOfSight,
  reach,
  type Side,
  type Spot,
  stepsFrom,
  type Tile,
  type TileGrid,
  tileKey,
  withEdges,
} from '@eb/core';
import type { Battle, GunRecord, Numbers, OrderRecord, Unit } from './types.ts';

/** Where the rolls come from: the kit's stream in play, Space-Wrecked's own generator in its golden test. */
export interface Rolls {
  /** A whole number from min to max, both included. */
  int(min: number, max: number): number;
}

/** What a battle is fought with: the map as packed, the numbers, the record's options, and the guns and orders. */
export interface Arena {
  readonly grid: TileGrid;
  readonly numbers: Numbers;
  readonly forgiving: boolean;
  readonly permadeath: boolean;
  readonly press: boolean;
  gun(id: string): GunRecord;
  order(id: string): OrderRecord;
}

/** The doors a battle has open and welded, which are all the grid needs of it. */
export type Doors = Pick<Battle, 'doors' | 'welds'>;

/** The grid as the battle's doors leave it. */
export const fieldOf = (arena: Arena, doors: Doors): TileGrid =>
  withEdges(
    arena.grid,
    doors.doors,
    doors.welds.map((weld) => weld.key),
  );

export const same = (a: Tile, b: Tile): boolean => a[0] === b[0] && a[1] === b[1];

/** Within sight's range and with a clear line. Units never block it. */
export function sees(arena: Arena, grid: TileGrid, from: Tile, to: Tile): boolean {
  const [dc, dr] = [to[0] - from[0], to[1] - from[1]];
  const range = arena.numbers.sight;
  return dc * dc + dr * dr <= range * range && lineOfSight(grid, from, to);
}

/** The cover a unit at `at` has against one at `from`; with none it is flanked. */
export function coverAt(grid: TileGrid, at: Tile, from: Tile): { cover: Cover; flanked: boolean } {
  const cover = coverFrom(grid, at, from);
  return { cover, flanked: cover === 'none' };
}

export const active = (unit: Unit): boolean => unit.status === 'active';

/** The units of the other side still in the fight. */
export const foesOf = (battle: Battle, unit: Pick<Unit, 'side'>): Unit[] =>
  battle.units.filter((u) => u.side !== unit.side && active(u));

/** By a side or a corner, or the same tile, walls not checked: as Stabilize asks. */
export const beside = (a: Tile, b: Tile): boolean => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) <= 1;

/** Every tile someone but the dead holds, but `unit`'s own: its side passes, the other doesn't. */
export function heldFor(battle: Battle, unit: Unit): Map<string, Holder> {
  const held = new Map<string, Holder>();
  for (const other of battle.units) {
    if (other.id !== unit.id && other.status !== 'dead')
      held.set(tileKey(other.at), other.side === unit.side ? 'ally' : 'foe');
  }
  return held;
}

/** Where `unit` can get to for at most `budget`, with the battle's doors. */
export const reachOf = (arena: Arena, battle: Battle, unit: Unit, budget: number): Map<string, Spot> =>
  reach(fieldOf(arena, battle), unit.at, budget, heldFor(battle, unit));

/** Steps from the nearest of `from` to every tile, with the battle's doors. */
export const stepsAway = (arena: Arena, doors: Doors, from: readonly Tile[]): Map<string, number> =>
  stepsFrom(fieldOf(arena, doors), from);

export const welded = (doors: Doors, at: Tile, side: Side): boolean => {
  const key = edgeKey(at, side);
  return doors.welds.some((weld) => weld.key === key);
};

/** A door on that side of the tile, shut and not welded: one a unit there can open. */
export const shutDoor = (arena: Arena, doors: Doors, at: Tile, side: Side): boolean =>
  arena.grid.edge(at[0], at[1], side) === 'door' &&
  !doors.doors.includes(edgeKey(at, side)) &&
  !welded(doors, at, side);

/** The ap a move of this cost takes: 1 within its mobility, 2 for a dash. */
export const apFor = (unit: Pick<Unit, 'mobility'>, cost: number): number => (cost <= unit.mobility ? 1 : 2);

/** How far a unit can walk with the ap it has: its mobility for each, two at most. */
export const budgetOf = (unit: Pick<Unit, 'mobility' | 'ap'>): number => unit.mobility * Math.min(unit.ap, 2);

export const unitOf = (battle: Battle, id: unknown): Unit | undefined => battle.units.find((u) => u.id === id);
