/** Tilemaps in the pure core (M7.2, D84, docs/specs/tilemaps.md): the grid, sight, cover, routes and map text. */
export { coverFrom, coverOnSide } from './cover.ts';
export { tileOf } from './facts.ts';
export {
  BLOCKS_SIGHT,
  type Cover,
  coverOf,
  FULL_COVER,
  gridOf,
  HALF_COVER,
  type PackTiles,
  SIDES,
  type Side,
  step,
  type Tile,
  type TileGrid,
  WALK,
  walkable,
} from './grid.ts';
export {
  ACROSS,
  DOWN,
  EDGE_CHARS,
  EDGE_KINDS,
  type EdgeKind,
  type Edges,
  edgesText,
  isMapText,
  mapTextSize,
  mapTextTiles,
  readEdges,
  trimLines,
} from './mapText.ts';
export { TILES_MOST, tilesProblem } from './pack.ts';
export { canStep, route } from './route.ts';
export { lineOfSight } from './sight.ts';
