// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// A ship's layout as a battle map: the only way a ship becomes a boarding
// map (ROADMAP §4.3). Each cell becomes tilesPerCell × tilesPerCell tiles:
// its room's interior template (data/modules.json) where a room stands, and
// space or hull around it. Walls stand on the edges between tiles: room
// walls, the hull, doorways where rooms join and hatches where airlocks
// open onto space, all as the builder joins them (builder.js joins()). A
// room can be wrecked: on fire, open to vacuum or full of rubble.
//
// Pure and deterministic: the same ship always gives the same map, and so
// does the same ship anywhere in the yard (only origin changes).
//
// A map is plain data, with grids from grid.js:
//   width, height  in tiles
//   tilesPerCell
//   origin         [x, y]: the yard cell under tile (0, 0)
//   tiles          grid of tile names: 'space', 'hull' (a notch or gap the
//                  hull fills: builder.js spaceTest()), or a name from the
//                  tiles legend in data/modules.json ('floor', 'half cover',
//                  'full cover', 'machinery', 'console', 'airlock')
//   roomAt         grid of the uid of the room each tile is in, or null
//   hazards        grid of the wreck of each tile's room: null, 'fire',
//                  'vacuum' or 'rubble'
//   walls          { n, w }: grids of what stands on each tile's north and
//                  west edge (wallAt reads any side): null for nothing,
//                  'wall' between rooms, 'hull' between a room and space or
//                  hull, 'door' where two rooms join, 'hatch' where an
//                  airlock opens onto space
//   rooms          [{ uid, type, x, y, w, h, wreck }] in build order: each
//                  room's tiles as a box, and its wreck or null
//   hatches        [{ uid, x, y, side }]: the tile inside each hatch, and the
//                  side it opens onto space
//
// Of this file the board needs only the map's shape, MARGIN, wallAt and
// edgeKey: the ship itself, and mapFromShip that reads it, stay behind.
import { cellAt, type Grid, type Side, step } from './grid.ts';
import type { Edge } from './map-text.ts';

export type Wreck = 'fire' | 'vacuum' | 'rubble';

export interface Room {
  uid: number;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  wreck: Wreck | null;
}

export interface Hatch {
  uid: number | null;
  x: number;
  y: number;
  side: Side;
}

export interface BattleMap {
  width: number;
  height: number;
  tilesPerCell: number;
  origin: [number, number];
  tiles: Grid<string>;
  roomAt: Grid<number | null>;
  hazards: Grid<Wreck | null>;
  walls: { n: Grid<Edge | null>; w: Grid<Edge | null> };
  rooms: Room[];
  hatches: Hatch[];
  // A site's (src/sim/gen/site.js): no space around it, and its template.
  margin?: number;
  site?: string;
}

export const MARGIN = 1; // cells of space around the ship
export const WRECKS: Wreck[] = ['fire', 'vacuum', 'rubble'];

// What stands on the given side of tile (x, y): null, 'wall', 'hull',
// 'door' or 'hatch'. Nothing stands on the map's own edge.
export function wallAt(map: Pick<BattleMap, 'walls'>, x: number, y: number, side: Side): Edge | null {
  if (side === 'n' || side === 'w') return cellAt(map.walls[side], x, y) ?? null;
  const [nx, ny] = step(x, y, side);
  return cellAt(map.walls[side === 's' ? 'n' : 'w'], nx, ny) ?? null;
}

// One key per tile edge, whichever of its two tiles names it: "x,y,n" or
// "x,y,w". Battles keep their open doors by it.
export function edgeKey(x: number, y: number, side: Side): string {
  if (side === 's') return `${x},${y + 1},n`;
  if (side === 'e') return `${x + 1},${y},w`;
  return `${x},${y},${side}`;
}
