// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// Planet maps, v1 (ROADMAP §4.7): the battle map of a job's site, from a
// hand-drawn template (data/sites.json) and a seed. A template is drawn in
// the battle map text format (mapText.js), with marks of its own on the
// tiles. The map has mapFromShip.js's shape, with no space around it
// (margin 0) and its template's id (site).
//
// Of this file the board needs regions(), which numbers the areas walls
// close off so each floor takes its own tint. A ship's map leaves space and
// the hull out of every area, as tools/battle-map.js's parseMap does; a
// site leaves out its rock.
import { cellAt, createGrid, type Grid, inBounds, type Side, step } from '../grid.ts';
import { wallAt } from '../map-from-ship.ts';
import type { Edge } from '../map-text.ts';

const SIDES: Side[] = ['n', 'e', 's', 'w'];
const IN_NO_ROOM = new Set(['rock', 'space', 'hull']);

// Each tile's area, for the floor's tint: the tiles that walls and doors
// close off from one another, numbered from 1 in reading order. Rock is in
// none.
export function regions(tiles: Grid<string>, walls: { n: Grid<Edge | null>; w: Grid<Edge | null> }): Grid<number | null> {
  const roomAt = createGrid<number | null>(tiles.width, tiles.height, null);
  const outside = (x: number, y: number) => IN_NO_ROOM.has(cellAt(tiles, x, y) as string);
  let next = 1;
  for (let y = 0; y < tiles.height; y++) {
    for (let x = 0; x < tiles.width; x++) {
      if (cellAt(roomAt, x, y) !== null || outside(x, y)) continue;
      const id = next++;
      const queue: [number, number][] = [[x, y]];
      roomAt.cells[y * tiles.width + x] = id;
      while (queue.length) {
        const [cx, cy] = queue.shift() as [number, number];
        for (const side of SIDES) {
          const [nx, ny] = step(cx, cy, side);
          if (!inBounds(tiles, nx, ny) || cellAt(roomAt, nx, ny) !== null || outside(nx, ny)) continue;
          if (wallAt({ walls }, cx, cy, side)) continue;
          roomAt.cells[ny * tiles.width + nx] = id;
          queue.push([nx, ny]);
        }
      }
    }
  }
  return roomAt;
}
