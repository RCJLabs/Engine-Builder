/**
 * Line of sight on a tilemap (M7.2, D84, docs/specs/tilemaps.md#sight-cover-and-routes; from
 * space-wrecked's src/sim/sight.js): a straight line from the middle of one tile to the middle of
 * another. An edge it crosses blocks it, a door too, and so does a tile it passes over that blocks
 * sight; the two ends never do. Where the line runs exactly through a corner, it gets by if either way
 * round is clear. The arithmetic is in whole numbers, so it is exact, and the same from either end.
 */
import { BLOCKS_SIGHT, type Side, type Tile, type TileGrid } from './grid.ts';

export function lineOfSight(grid: TileGrid, [ax, ay]: Tile, [bx, by]: Tile): boolean {
  const [nx, ny] = [Math.abs(bx - ax), Math.abs(by - ay)];
  const [sx, sy] = [Math.sign(bx - ax), Math.sign(by - ay)];
  const xSide: Side = sx > 0 ? 'e' : 'w';
  const ySide: Side = sy > 0 ? 's' : 'n';
  const crossX = (x: number, y: number) => grid.edge(x, y, xSide) === null;
  const crossY = (x: number, y: number) => grid.edge(x, y, ySide) === null;
  const clear = (x: number, y: number) => (x === bx && y === by) || (grid.rule(x, y) & BLOCKS_SIGHT) === 0;
  let [x, y, i, j] = [ax, ay, 1, 1];
  while (i <= nx || j <= ny) {
    // Where the line meets the next grid line across x and across y, both scaled by 2 · nx · ny so they stay whole.
    const atX = i <= nx ? (2 * i - 1) * ny : Number.POSITIVE_INFINITY;
    const atY = j <= ny ? (2 * j - 1) * nx : Number.POSITIVE_INFINITY;
    if (atX < atY) {
      if (!crossX(x, y)) return false;
      x += sx;
      i++;
    } else if (atY < atX) {
      if (!crossY(x, y)) return false;
      y += sy;
      j++;
    } else {
      // Exactly through a corner: round it one way or the other.
      const viaX = crossX(x, y) && clear(x + sx, y) && crossY(x + sx, y);
      const viaY = crossY(x, y) && clear(x, y + sy) && crossX(x, y + sy);
      if (!viaX && !viaY) return false;
      x += sx;
      y += sy;
      i++;
      j++;
    }
    if (!clear(x, y)) return false;
  }
  return true;
}
