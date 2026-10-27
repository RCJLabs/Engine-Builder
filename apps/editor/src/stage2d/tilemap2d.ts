/**
 * A tilemap drawn and walked in a 2D space (M7.2, D84, docs/specs/tilemaps.md#the-stage), as plain
 * values: each layer's frame at each cell, a tile that joins picking `frame + mask` by its neighbours
 * in the same layer that are the same tile (north 1, east 2, south 4, west 8; from 2060td's walls,
 * glyphs.ts:76-84); then the edges, each frame centred on its edge's line, and a post on every corner
 * an edge meets. Boxes are world art pixels, y up from the map's bottom-left corner, row 0 the top.
 */
import type { TilemapFields } from '@eb/compiler';
import { type Edges, type PackTiles, readEdges, type Tile } from '@eb/core';
import type { TilesetRecord } from '@eb/schema';
import type { Point } from './camera.ts';
import type { Rect } from './place.ts';

/** One frame the map draws, at its world box. */
export interface TileDraw {
  readonly frame: number;
  readonly box: Rect;
}

const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;

/** The tile each character is written as: the first tile with it, as @eb/schema's legendOf, kept here so the stage carries none of the schemas. */
function legendOf(tileset: TilesetRecord): Map<string, string> {
  const legend = new Map<string, string>();
  for (const [id, tile] of Object.entries(tileset.tiles)) if (!legend.has(tile.char)) legend.set(tile.char, id);
  return legend;
}

/** Each layer's rows as cells, the map's size: a character a cell, ' ' where none. */
function cellsOf(map: TilemapFields): string[][][] {
  const [cols, rows] = map.size;
  return map.layers.map((layer) =>
    Array.from({ length: rows }, (_, r) => {
      const row = [...(layer.rows[r] ?? '')];
      return Array.from({ length: cols }, (_, c) => row[c] ?? ' ');
    }),
  );
}

/** The neighbours of (c, r) that are `ch` too, as a mask: one off the map doesn't join. */
export function joinMask(cells: readonly (readonly string[])[], c: number, r: number, ch: string): number {
  const is = (cc: number, rr: number) => cells[rr]?.[cc] === ch;
  return (
    (is(c, r - 1) ? NORTH : 0) | (is(c + 1, r) ? EAST : 0) | (is(c, r + 1) ? SOUTH : 0) | (is(c - 1, r) ? WEST : 0)
  );
}

/** Each layer's frame at each cell, -1 where it draws none: `frames[layer][row][col]`. */
export function cellFrames(map: TilemapFields, tileset: TilesetRecord): number[][][] {
  const legend = legendOf(tileset);
  return cellsOf(map).map((cells) =>
    cells.map((row, r) =>
      row.map((ch, c) => {
        const tile = tileset.tiles[legend.get(ch) ?? ''];
        if (!tile) return -1;
        return tile.frame + (tile.joins === true ? joinMask(cells, c, r, ch) : 0);
      }),
    ),
  );
}

/** Whether any edge meets the corner at the top-left of tile (c, r). */
const meets = (edges: Edges, c: number, r: number): boolean =>
  [edges.across[r]?.[c - 1], edges.across[r]?.[c], edges.down[r - 1]?.[c], edges.down[r]?.[c]].some(
    (kind) => kind !== undefined && kind !== null,
  );

/** Everything the map draws, in order: its layers' tiles, then its edges, then its posts. */
export function tileDraws(map: TilemapFields, tileset: TilesetRecord, at: Point): TileDraw[] {
  const [cols, rows] = map.size;
  const [w, h] = tileset.tile;
  const [hw, hh] = [Math.floor(w / 2), Math.floor(h / 2)];
  const left = (c: number) => at[0] + c * w;
  const foot = (r: number) => at[1] + (rows - 1 - r) * h;
  const draws: TileDraw[] = [];
  for (const layer of cellFrames(map, tileset))
    for (const [r, row] of layer.entries())
      for (const [c, frame] of row.entries())
        if (frame >= 0) draws.push({ frame, box: { x: left(c), y: foot(r), w, h } });
  const frames = tileset.edges;
  if (!frames || map.edges === undefined) return draws;
  const edges = readEdges(map.edges, cols, rows);
  for (const [r, line] of edges.across.entries())
    for (const [c, kind] of line.entries()) {
      const frame = kind ? frames[kind]?.across : undefined;
      if (frame !== undefined) draws.push({ frame, box: { x: left(c), y: foot(r) + h - hh, w, h } });
    }
  for (const [r, line] of edges.down.entries())
    for (const [c, kind] of line.entries()) {
      const frame = kind ? frames[kind]?.down : undefined;
      if (frame !== undefined) draws.push({ frame, box: { x: left(c) - hw, y: foot(r), w, h } });
    }
  if (frames.post !== undefined)
    for (let r = 0; r <= rows; r++)
      for (let c = 0; c <= cols; c++)
        if (meets(edges, c, r)) draws.push({ frame: frames.post, box: { x: left(c) - hw, y: foot(r) + h - hh, w, h } });
  return draws;
}

/** The tile a world point stands on in a packed tilemap, or undefined off it. */
export function tileUnder(tiles: PackTiles, point: Point): Tile | undefined {
  const [cols, rows] = tiles.size;
  const c = Math.floor((point[0] - tiles.at[0]) / tiles.tile[0]);
  const r = rows - 1 - Math.floor((point[1] - tiles.at[1]) / tiles.tile[1]);
  return c >= 0 && c < cols && r >= 0 && r < rows ? [c, r] : undefined;
}

/** A tile's centre in whole world pixels: where a routed walker's feet pass. */
export function tileCentre(tiles: PackTiles, [c, r]: Tile): Point {
  const [w, h] = tiles.tile;
  return [tiles.at[0] + c * w + Math.floor(w / 2), tiles.at[1] + (tiles.size[1] - 1 - r) * h + Math.floor(h / 2)];
}
