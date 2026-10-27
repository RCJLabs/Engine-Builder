/**
 * A space's tilemap as the sim and the stage read it (M7.2, D84, docs/specs/tilemaps.md#the-pack): the
 * compiler's packed cells and edges, format 18's, as a grid of rules and edges by column and row, row 0
 * the top one. One grid model for sight, cover and routes, as Space-Wrecked keeps one (grid.js).
 */
import { type EdgeKind, readEdges } from './mapText.ts';

/** Format 18 (M7.2): a space's tilemap, worked out by the compiler from its layers, tileset and edges. */
export interface PackTiles {
  /** The tilemap object's path. */
  readonly object: string;
  /** Its bottom-left corner in art pixels, its tile's size, and its columns and rows. */
  readonly at: readonly [number, number];
  readonly tile: readonly [number, number];
  readonly size: readonly [number, number];
  /** Row 0 first: a hexadecimal digit a cell, its rules (walk 1, blocks sight 2, half cover 4, full cover 8). */
  readonly cells: readonly string[];
  /** The edges as map text, 2 × rows + 1 lines of 2 × cols + 1, tiles' places blank. */
  readonly edges: readonly string[];
  /** Each object of the space on the map, by path: its column and row. */
  readonly places: Readonly<Record<string, readonly [number, number]>>;
}

export const WALK = 1;
export const BLOCKS_SIGHT = 2;
export const HALF_COVER = 4;
export const FULL_COVER = 8;

export type Side = 'n' | 'e' | 's' | 'w';
/** The order steps are tried in, as Space-Wrecked's moves try them. */
export const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];

/** A tile by its column and row. */
export type Tile = readonly [number, number];

export const step = ([c, r]: Tile, side: Side): Tile =>
  side === 'n' ? [c, r - 1] : side === 's' ? [c, r + 1] : side === 'e' ? [c + 1, r] : [c - 1, r];

export interface TileGrid {
  readonly cols: number;
  readonly rows: number;
  /** A cell's rules, 0 off the map. */
  rule(c: number, r: number): number;
  /** The edge on a side of a tile, or null: off the map's far borders too. */
  edge(c: number, r: number, side: Side): EdgeKind | null;
}

const grids = new WeakMap<PackTiles, TileGrid>();

/** The grid a packed tilemap reads as, made once for each. */
export function gridOf(tiles: PackTiles): TileGrid {
  const made = grids.get(tiles);
  if (made) return made;
  const [cols, rows] = tiles.size;
  const rules = new Uint8Array(cols * rows);
  tiles.cells.forEach((line, r) => {
    for (let c = 0; c < cols && c < line.length; c++) rules[r * cols + c] = Number.parseInt(line[c] as string, 16) || 0;
  });
  const { across, down } = readEdges(tiles.edges, cols, rows);
  const inside = (c: number, r: number) => c >= 0 && c < cols && r >= 0 && r < rows;
  const grid: TileGrid = {
    cols,
    rows,
    rule: (c, r) => (inside(c, r) ? (rules[r * cols + c] as number) : 0),
    edge(c, r, side) {
      if (!inside(c, r)) return null;
      if (side === 'n') return across[r]?.[c] ?? null;
      if (side === 's') return across[r + 1]?.[c] ?? null;
      if (side === 'w') return down[r]?.[c] ?? null;
      return down[r]?.[c + 1] ?? null;
    },
  };
  grids.set(tiles, grid);
  return grid;
}

export const walkable = (grid: TileGrid, [c, r]: Tile): boolean => (grid.rule(c, r) & WALK) !== 0;

/** A cover level: none, half or full. */
export type Cover = 'none' | 'half' | 'full';

export const coverOf = (rule: number): Cover =>
  (rule & FULL_COVER) !== 0 ? 'full' : (rule & HALF_COVER) !== 0 ? 'half' : 'none';
