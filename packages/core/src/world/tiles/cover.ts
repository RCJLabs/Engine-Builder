/**
 * Cover on a tilemap (M7.2, D84, docs/specs/tilemaps.md#sight-cover-and-routes; from space-wrecked's
 * src/sim/cover.js). Each side of a tile gives cover from what is there: an edge, any kind, is full
 * cover, and otherwise the tile beyond gives its own. Cover on a side counts against someone on that
 * side, so the north side's counts against anyone north of it, and the best that counts is the cover
 * against them. With none, they are flanked.
 */
import { type Cover, coverOf, SIDES, type Side, step, type Tile, type TileGrid } from './grid.ts';

const LEVEL: Readonly<Record<Cover, number>> = { none: 0, half: 1, full: 2 };

/** The cover someone at `at` has against someone at `from`. */
export function coverFrom(grid: TileGrid, at: Tile, from: Tile): Cover {
  let best: Cover = 'none';
  for (const side of SIDES) {
    if (!facing(side, at, from)) continue;
    const here = coverOnSide(grid, at, side);
    if (LEVEL[here] > LEVEL[best]) best = here;
  }
  return best;
}

/** The cover on one side of a tile, whoever it is against. */
export function coverOnSide(grid: TileGrid, at: Tile, side: Side): Cover {
  if (grid.edge(at[0], at[1], side) !== null) return 'full';
  const [c, r] = step(at, side);
  return coverOf(grid.rule(c, r));
}

/** Whether `from` is on the given side of `at`, row 0 the top. */
function facing(side: Side, [x, y]: Tile, [fx, fy]: Tile): boolean {
  if (side === 'n') return fy < y;
  if (side === 's') return fy > y;
  if (side === 'e') return fx > x;
  return fx < x;
}
