/**
 * Doors as a battle leaves them, and where a unit can walk (M7.5, D87, docs/specs/tactics.md#the-rules-in-the-engine;
 * from space-wrecked's src/sim/moves.js and terrain.js). The map's edges never change; a battle keeps
 * which doors are open and which are welded shut, and lays them over the grid. Paths of equal cost tie
 * the same way: the first found, trying north, east, south, west.
 */
import { SIDES, type Side, step, type Tile, type TileGrid } from './grid.ts';
import { canStep } from './route.ts';

/** An edge's key, the same from either tile: `"c,r,n"` or `"c,r,w"`, on the tile south or east of it. */
export const edgeKey = ([c, r]: Tile, side: Side): string =>
  side === 's' ? `${c},${r + 1},n` : side === 'e' ? `${c + 1},${r},w` : `${c},${r},${side}`;

/** A tile's key in the maps below. */
export const tileKey = ([c, r]: Tile): string => `${c},${r}`;

/**
 * The grid with a battle's doors laid over it: an open door is no edge, so sight and cover pass it; a
 * welded one is a wall, which stops walking too. Keys are edgeKey's.
 */
export function withEdges(grid: TileGrid, open: readonly string[], welded: readonly string[]): TileGrid {
  if (open.length === 0 && welded.length === 0) return grid;
  const [opened, shut] = [new Set(open), new Set(welded)];
  return {
    cols: grid.cols,
    rows: grid.rows,
    rule: grid.rule,
    edge(c, r, side) {
      const edge = grid.edge(c, r, side);
      if (edge !== 'door') return edge;
      const key = edgeKey([c, r], side);
      if (shut.has(key)) return 'wall';
      return opened.has(key) ? null : edge;
    },
  };
}

/** Where a unit can stop: its cost from where it stands, and the tiles there, both ends included. */
export interface Spot {
  readonly tile: Tile;
  readonly cost: number;
  readonly path: readonly Tile[];
}

/** Who holds a tile: a unit's own side passes through it, the other side's stops it. */
export type Holder = 'ally' | 'foe';

/**
 * Every tile a unit at `from` can get to for at most `budget`, by tileKey, in the order first found: a
 * bucket a cost, first in first out within one, each step costing 1. It can pass its allies but not its
 * foes, and stop on no one: every held tile is taken out at the end. Its own tile is there at cost 0
 * (space-wrecked's reachable).
 */
export function reach(
  grid: TileGrid,
  from: Tile,
  budget: number,
  held: ReadonlyMap<string, Holder>,
): Map<string, Spot> {
  const start: Spot = { tile: from, cost: 0, path: [from] };
  const best = new Map<string, Spot>([[tileKey(from), start]]);
  const buckets: Spot[][] = [[start]];
  for (let cost = 0; cost < buckets.length; cost++) {
    for (const here of buckets[cost] ?? []) {
      // A cheaper way was found since.
      if (best.get(tileKey(here.tile)) !== here) continue;
      for (const side of SIDES) {
        if (!canStep(grid, here.tile, side)) continue;
        const tile = step(here.tile, side);
        const key = tileKey(tile);
        if (held.get(key) === 'foe') continue;
        const next = cost + 1;
        const known = best.get(key);
        if (next > budget || (known !== undefined && known.cost <= next)) continue;
        const spot: Spot = { tile, cost: next, path: [...here.path, tile] };
        best.set(key, spot);
        const bucket = buckets[next] ?? [];
        bucket.push(spot);
        buckets[next] = bucket;
      }
    }
  }
  for (const key of held.keys()) best.delete(key);
  return best;
}

/** Steps from the nearest of `sources` to every tile a walker can get to, past anyone, by tileKey. */
export function stepsFrom(grid: TileGrid, sources: readonly Tile[]): Map<string, number> {
  const away = new Map<string, number>(sources.map((tile) => [tileKey(tile), 0]));
  const queue: Tile[] = [...sources];
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i] as Tile;
    for (const side of SIDES) {
      if (!canStep(grid, here, side)) continue;
      const tile = step(here, side);
      if (away.has(tileKey(tile))) continue;
      away.set(tileKey(tile), (away.get(tileKey(here)) as number) + 1);
      queue.push(tile);
    }
  }
  return away;
}

/** The side of `from` that `to`, one step away, is across. */
export function sideToward([fc, fr]: Tile, [tc, tr]: Tile): Side {
  if (tr < fr) return 'n';
  if (tc > fc) return 'e';
  if (tr > fr) return 's';
  return 'w';
}
