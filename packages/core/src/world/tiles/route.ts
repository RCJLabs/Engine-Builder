/**
 * Routes on a tilemap (M7.2, D84, docs/specs/tilemaps.md#sight-cover-and-routes; from space-wrecked's
 * src/sim/moves.js): four-way steps between tiles a walker can stand on. A wall, the hull or a hatch on
 * the edge between two tiles stands in the way; a door doesn't, since walking through opens it. Every
 * step costs 1, and routes of equal length tie the same way: the first found, trying north, east,
 * south, west. A walker standing where it can't walk may still step off.
 */
import { SIDES, step, type Tile, type TileGrid, walkable } from './grid.ts';

/** Whether a walker can step from a tile out across a side. */
export function canStep(grid: TileGrid, from: Tile, side: (typeof SIDES)[number]): boolean {
  const edge = grid.edge(from[0], from[1], side);
  return (edge === null || edge === 'door') && walkable(grid, step(from, side));
}

/** The tiles from `from` to `to`, both included, or null when `to` can't be reached. */
export function route(grid: TileGrid, from: Tile, to: Tile): Tile[] | null {
  const { cols, rows } = grid;
  const index = ([c, r]: Tile) => r * cols + c;
  const inside = ([c, r]: Tile) => c >= 0 && c < cols && r >= 0 && r < rows;
  if (!inside(from) || !inside(to) || !walkable(grid, to)) return null;
  const came = new Int32Array(cols * rows).fill(-1);
  came[index(from)] = index(from);
  const queue: Tile[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const here = queue[head] as Tile;
    if (here[0] === to[0] && here[1] === to[1]) break;
    for (const side of SIDES) {
      if (!canStep(grid, here, side)) continue;
      const next = step(here, side);
      if (came[index(next)] !== -1) continue;
      came[index(next)] = index(here);
      queue.push(next);
    }
  }
  if (came[index(to)] === -1) return null;
  const tiles: Tile[] = [];
  for (let at = index(to); ; at = came[at] as number) {
    tiles.push([at % cols, Math.floor(at / cols)]);
    if (at === index(from)) break;
  }
  return tiles.reverse();
}
