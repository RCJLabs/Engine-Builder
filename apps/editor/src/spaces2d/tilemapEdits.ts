/**
 * A tilemap's edits in the Scene panel's 2D view (M7.2, D84, docs/specs/tilemaps.md#the-editor), as
 * plain functions of its fields: the cell under a point, cells painted and erased in a layer, the side
 * of a cell nearest a point and edges set on sides, and pasted text imported into a layer, its size
 * grown to fit. Rows keep no trailing spaces, and a layer no trailing empty rows, so a file holds what
 * was drawn. Edges are written back whole by core's edgesText, so they always read as map text.
 */
import type { SpaceJson, SpaceObject, TilemapFields } from '@eb/compiler';
import {
  type EdgeKind,
  type Edges,
  edgesText,
  isMapText,
  mapTextSize,
  mapTextTiles,
  readEdges,
  TILES_MOST,
  trimLines,
} from '@eb/core';
import type { Point } from '../stage2d/camera.ts';

export type Cell = readonly [number, number];
export type Side = 'n' | 'e' | 's' | 'w';

/** Where a tilemap lies: its bottom-left corner, its size in tiles and its tile in art pixels. */
export interface MapPlace {
  readonly at: Point;
  readonly size: readonly [number, number];
  readonly tile: Point;
}

/** The cell under a world point, row 0 the top, or undefined off the map. */
export function cellAt(map: MapPlace, point: Point): Cell | undefined {
  const [cols, rows] = map.size;
  const c = Math.floor((point[0] - map.at[0]) / map.tile[0]);
  const r = rows - 1 - Math.floor((point[1] - map.at[1]) / map.tile[1]);
  return c >= 0 && c < cols && r >= 0 && r < rows ? [c, r] : undefined;
}

/**
 * The cell under a point and the side of it the point is nearest; with `along`, only the sides on that
 * axis (north and south across, east and west down), so a stroke along a wall stays on its line.
 */
export function nearestSide(
  map: MapPlace,
  point: Point,
  along?: 'across' | 'down',
): { cell: Cell; side: Side } | undefined {
  const cell = cellAt(map, point);
  if (!cell) return undefined;
  const [w, h] = map.tile;
  const x = point[0] - map.at[0] - cell[0] * w;
  const y = point[1] - map.at[1] - (map.size[1] - 1 - cell[1]) * h;
  // Distances to each side, y up from the cell's foot: north is its top.
  const far = (
    [
      ['n', h - y],
      ['e', w - x],
      ['s', y],
      ['w', x],
    ] as [Side, number][]
  ).filter(([side]) => along === undefined || (along === 'across') === (side === 'n' || side === 's'));
  const [side] = far.reduce((best, next) => (next[1] < best[1] ? next : best));
  return { cell, side };
}

const tidy = (rows: string[]): string[] => {
  const kept = rows.map((row) => row.replace(/ +$/, ''));
  while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop();
  return kept;
};

/** The fields with `cells` of layer `layer` set to `ch`; a space erases. */
export function paintCells(fields: TilemapFields, layer: number, cells: readonly Cell[], ch: string): TilemapFields {
  const target = fields.layers[layer];
  if (!target) return fields;
  const rows = [...target.rows];
  for (const [c, r] of cells) {
    while (rows.length <= r) rows.push('');
    const row = [...(rows[r] as string).padEnd(c + 1, ' ')];
    row[c] = ch;
    rows[r] = row.join('');
  }
  const layers = fields.layers.map((l, i) => (i === layer ? { ...l, rows: tidy(rows) } : l));
  return { ...fields, layers };
}

const copyEdges = (edges: Edges) => ({
  across: edges.across.map((line) => [...line]),
  down: edges.down.map((line) => [...line]),
});

/** The fields with an edge of `kind` on each side given, or none where `kind` is null. */
export function setEdges(
  fields: TilemapFields,
  sides: readonly { cell: Cell; side: Side }[],
  kind: EdgeKind | null,
): TilemapFields {
  const [cols, rows] = fields.size;
  const edges = copyEdges(readEdges(fields.edges ?? [], cols, rows));
  for (const {
    cell: [c, r],
    side,
  } of sides) {
    if (side === 'n' || side === 's') {
      const line = edges.across[side === 'n' ? r : r + 1];
      if (line) line[c] = kind;
    } else {
      const line = edges.down[r];
      if (line) line[side === 'w' ? c : c + 1] = kind;
    }
  }
  return withEdges(fields, edges);
}

function withEdges(fields: TilemapFields, edges: Edges): TilemapFields {
  const none = [...edges.across, ...edges.down].every((line) => line.every((kind) => kind === null));
  const { edges: _, ...rest } = fields;
  return none ? rest : { ...rest, edges: edgesText(edges, fields.size[0], fields.size[1]) };
}

/** What Import ASCII… makes of pasted text: the fields it leaves, or the characters no tile is. */
export type Imported = { readonly fields: TilemapFields } | { readonly unknown: readonly string[] };

/**
 * Pasted text into layer `layer`: Space-Wrecked's map text brings its tiles and its edges, any other
 * text is a character a tile. The size grows to fit, never past 256; nothing changes while a
 * character isn't a tile of `chars`.
 */
export function importText(fields: TilemapFields, layer: number, text: string, chars: ReadonlySet<string>): Imported {
  const lines = trimLines(text);
  const mapText = isMapText(lines);
  const tiles = mapText ? mapTextTiles(lines) : lines.map((line) => line.replace(/ +$/, ''));
  const unknown = [...new Set(tiles.join('').replace(/ /g, ''))].filter((ch) => !chars.has(ch)).sort();
  if (unknown.length > 0) return { unknown };
  const [w, h] = mapText ? mapTextSize(lines) : [Math.max(0, ...tiles.map((row) => [...row].length)), tiles.length];
  const size: [number, number] = [
    Math.min(TILES_MOST, Math.max(fields.size[0], w)),
    Math.min(TILES_MOST, Math.max(fields.size[1], h)),
  ];
  const layers = fields.layers.map((l, i) => (i === layer ? { ...l, rows: tidy(tiles) } : l));
  const grown = { ...fields, size, layers };
  const edges = readEdges(mapText ? lines : (fields.edges ?? []), size[0], size[1]);
  return { fields: withEdges(grown, edges) };
}

/** A new tilemap: one empty layer, its object a box (as every object is a shape, a prefab or a record). */
export function newTilemap(tileset: string, size: readonly [number, number]): SpaceObject {
  return {
    id: 'tilemap',
    shape: 'box',
    components: { tilemap: { tileset, size: [size[0], size[1]], layers: [{ id: 'floor', rows: [] }] } },
  };
}

/** The space with the top-level object `id`'s tilemap fields replaced. */
export function withTilemap(space: SpaceJson, id: string, fields: TilemapFields): SpaceJson {
  return {
    ...space,
    objects: space.objects.map((object) =>
      object.id === id ? { ...object, components: { ...object.components, tilemap: { ...fields } } } : object,
    ),
  };
}
