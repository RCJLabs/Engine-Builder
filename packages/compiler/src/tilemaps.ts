/**
 * A 2D space's tilemap (M7.2, D84, docs/specs/tilemaps.md#a-tilemap): found through its prefabs, held
 * to its tileset and its size (E093), and worked out into format 18's grid: each cell's rules from its
 * topmost layer's tile, the edges as full map text, and the tile each object stands on.
 */
import { edgesText, type PackTiles, readEdges, TILES_MOST, WALK } from '@eb/core';
import { type Diagnostic, type DiagnosticCode, legendOf, severityOf, TILESET, type TilesetRecord } from '@eb/schema';
import { eachFlat, type Point } from './flatPlaces.ts';
import { isFields } from './overrides.ts';
import type { SpaceJson } from './spaceShape.ts';
import { is2d } from './spaceView.ts';

export const TILEMAP = 'tilemap';

/** A tilemap component as its file holds it, once its kind's schema passed. */
export interface TilemapFields {
  readonly tileset: string;
  readonly size: readonly [number, number];
  readonly layers: readonly { readonly id: string; readonly rows: readonly string[] }[];
  readonly edges?: readonly string[];
}

/** A tilemap as placed: the path of the object that holds it, its bottom-left corner and its fields. */
export interface FoundTilemap {
  readonly path: string;
  readonly at: Point;
  readonly fields: TilemapFields;
}

export const isTilemap = (value: unknown): value is TilemapFields =>
  isFields(value) &&
  typeof value.tileset === 'string' &&
  Array.isArray(value.size) &&
  Array.isArray(value.layers) &&
  value.layers.every((layer) => isFields(layer) && Array.isArray(layer.rows));

const isPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every((n) => Number.isInteger(n) && n >= 1);

/** A tileset record's value, when it is whole enough to read a tilemap through. */
export const tilesetIn = (value: unknown): TilesetRecord | undefined =>
  isFields(value) &&
  isPair(value.tile) &&
  isFields(value.tiles) &&
  Object.values(value.tiles).every((tile) => isFields(tile) && typeof tile.char === 'string')
    ? (value as unknown as TilesetRecord)
    : undefined;

/** The tilemaps a space places, through its prefabs, in the file's order. */
export function tilemapsIn(space: SpaceJson, prefabs: Readonly<Record<string, unknown>>): FoundTilemap[] {
  const found: FoundTilemap[] = [];
  eachFlat(space, prefabs, (path, seen, place) => {
    const fields = seen.components?.[TILEMAP];
    if (isTilemap(fields)) found.push({ path, at: place.at, fields });
  });
  return found;
}

const CORNERS = /^[+ ]*$/;
const ACROSS = /^[-=/o ]*$/;
const DOWN = /^[|I/o ]*$/;

/** E093 for a tilemap against its tileset and its size: each a path inside the component and why. */
export function tilemapProblems(fields: TilemapFields, tileset: TilesetRecord | undefined): [string, string][] {
  const found: [string, string][] = [];
  const [cols, rows] = fields.size;
  if (![cols, rows].every((n) => Number.isInteger(n) && n >= 1 && n <= TILES_MOST))
    return [['/size', `A tilemap is 1 to ${TILES_MOST} tiles each way`]];
  const legend = tileset ? legendOf(tileset) : undefined;
  fields.layers.forEach((layer, l) => {
    if (layer.rows.length > rows)
      found.push([`/layers/${l}/rows`, `It has ${layer.rows.length} rows: the map has ${rows}`]);
    layer.rows.forEach((row, r) => {
      const at = `/layers/${l}/rows/${r}`;
      if ([...row].length > cols) found.push([at, `It is ${[...row].length} tiles long: the map is ${cols} across`]);
      const unknown = [...new Set([...row].filter((ch) => ch !== ' ' && legend && !legend.has(ch)))];
      if (unknown.length > 0)
        found.push([
          at,
          `${unknown.map((ch) => `“${ch}”`).join(', ')} ${unknown.length === 1 ? 'is' : 'are'} no tile of the tileset`,
        ]);
    });
  });
  found.push(...edgesProblems(fields.edges, cols, rows, tileset));
  return found;
}

function edgesProblems(
  edges: readonly string[] | undefined,
  cols: number,
  rows: number,
  tileset: TilesetRecord | undefined,
): [string, string][] {
  if (edges === undefined) return [];
  const found: [string, string][] = [];
  if (edges.length > 2 * rows + 1)
    found.push(['/edges', `Its edges are ${edges.length} lines: a map of ${rows} rows has ${2 * rows + 1}`]);
  edges.forEach((line, i) => {
    const at = `/edges/${i}`;
    if (line.length > 2 * cols + 1)
      found.push([at, `It is ${line.length} long: a map ${cols} across is ${2 * cols + 1}`]);
    const [evens, odds] = [0, 1].map((parity) => [...line].filter((_, j) => j % 2 === parity).join(''));
    // An edge row: corners at even columns, a tile's north edge at odd ones. A tile row: a tile's west
    // edge at even columns and the tile at odd ones, blank here: the tiles are the layers'.
    if (i % 2 === 0 && !(CORNERS.test(evens ?? '') && ACROSS.test(odds ?? '')))
      found.push([at, 'An edge row holds + at its corners and - = / o on its edges']);
    if (i % 2 === 1 && !(DOWN.test(evens ?? '') && (odds ?? '').trim() === ''))
      found.push([at, 'A tile row holds | I / o on its edges and no tiles: the tiles are the layers’']);
  });
  if (tileset && tileset.edges === undefined && edges.some((line) => line.trim() !== ''))
    found.push(['/edges', 'Its tileset has no edges to draw these with']);
  return found;
}

/** A cell's rules as format 18's digit: walk 1, blocks sight 2, half cover 4, full cover 8. */
function ruleOf(tile: TilesetRecord['tiles'][string] | undefined): string {
  if (!tile) return '0';
  const bits =
    (tile.walk === true ? 1 : 0) |
    (tile.blocksSight === true ? 2 : 0) |
    (tile.cover === 'half' ? 4 : 0) |
    (tile.cover === 'full' ? 8 : 0);
  return bits.toString(16);
}

/** Each cell's rules, row 0 first: its topmost layer's tile, or none. */
export function cellRules(fields: TilemapFields, tileset: TilesetRecord): string[] {
  const [cols, rows] = fields.size;
  const legend = legendOf(tileset);
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      for (let l = fields.layers.length - 1; l >= 0; l--) {
        const ch = [...(fields.layers[l]?.rows[r] ?? '')][c];
        if (ch !== undefined && ch !== ' ') return ruleOf(tileset.tiles[legend.get(ch) ?? '']);
      }
      return '0';
    }).join(''),
  );
}

/** The tile a point stands on, or undefined off the map. */
export function tileAt(map: FoundTilemap, tile: Point, point: Point): Point | undefined {
  const [cols, rows] = map.fields.size;
  const c = Math.floor((point[0] - map.at[0]) / tile[0]);
  const fromFoot = Math.floor((point[1] - map.at[1]) / tile[1]);
  const r = rows - 1 - fromFoot;
  return c >= 0 && c < cols && r >= 0 && r < rows ? [c, r] : undefined;
}

/** Format 18's grid for a space's first tilemap, or undefined when it has none or its tileset isn't there. */
export function packTilesOf(
  space: SpaceJson,
  prefabs: Readonly<Record<string, unknown>>,
  tilesetOf: (id: string) => TilesetRecord | undefined,
): PackTiles | undefined {
  const map = tilemapsIn(space, prefabs)[0];
  const tileset = map === undefined ? undefined : tilesetOf(map.fields.tileset);
  if (!map || !tileset) return undefined;
  const [cols, rows] = map.fields.size;
  const places: Record<string, [number, number]> = {};
  eachFlat(space, prefabs, (path, _seen, place) => {
    const on = tileAt(map, tileset.tile, place.at);
    if (on && path !== map.path) places[path] = [on[0], on[1]];
  });
  const edges = map.fields.edges ?? [];
  return {
    object: map.path,
    at: map.at,
    tile: tileset.tile,
    size: [cols, rows],
    cells: cellRules(map.fields, tileset),
    edges: edgesText(readEdges(edges, cols, rows), cols, rows),
    places: Object.fromEntries(
      Object.keys(places)
        .sort()
        .map((path) => [path, places[path] as [number, number]]),
    ),
  };
}

/**
 * E093 for a tilemap component that passed its kind's schema, each at a path inside it. With `only`,
 * the fields a prefab's override sets, only problems in those are reported: the rest are the prefab's.
 */
export function checkTilemapFields(
  fields: unknown,
  tilesetOf: (id: string) => unknown,
  only: ReadonlySet<string> | undefined,
  report: (path: string, message: string) => void,
): void {
  if (!isTilemap(fields)) return;
  for (const [path, message] of tilemapProblems(fields, tilesetIn(tilesetOf(fields.tileset))))
    if (!only || only.has(path.split('/')[1] ?? '')) report(path, message);
}

type TilesetOf = (id: string) => TilesetRecord | undefined;

/**
 * A space's tilemaps against each other and its walkers (M7.2): E093 for every tilemap after its
 * first, and W157 for an actor placed off the first one's walkable cells. Each is reported at the
 * top-level object it is in, naming the path inside a prefab.
 */
export function checkTilemapSpace(
  file: string,
  space: SpaceJson,
  prefabs: Readonly<Record<string, unknown>>,
  tilesetOf: TilesetOf,
): Diagnostic[] {
  const maps = tilemapsIn(space, prefabs);
  const [first] = maps;
  const tileset = first === undefined ? undefined : tilesetOf(first.fields.tileset);
  const found: Diagnostic[] = [];
  const at = (code: DiagnosticCode, path: string, field: string, why: string) => {
    const i = space.objects.findIndex((object) => object.id === path.split('/')[0]);
    const nested = path.includes('/');
    const message = nested ? `${why} (${path.split('/').join(' › ')})` : why;
    found.push({ code, severity: severityOf(code), message, file, path: `/objects/${i}${nested ? '' : field}` });
  };
  for (const map of maps.slice(1))
    at('E093', map.path, '/components/tilemap', `A space has one tilemap: “${first?.path}” is its first`);
  if (!first || !tileset) return found;
  const cells = cellRules(first.fields, tileset);
  eachFlat(space, prefabs, (path, seen, place) => {
    if (!seen.record?.startsWith('actor:')) return;
    const on = tileAt(first, tileset.tile, place.at);
    const rule = on === undefined ? 0 : Number.parseInt(cells[on[1]]?.[on[0]] ?? '0', 16);
    if (on === undefined) at('W157', path, '/at', 'It stands off the tilemap: a walker there can’t route anywhere');
    else if ((rule & WALK) === 0)
      at('W157', path, '/at', `It stands on tile ${on[0]}, ${on[1]}, which can’t be walked: it can only step off it`);
  });
  return found;
}

/** Format 18's tiles: each 2D space's first tilemap whose tileset is there, by space. */
export function packTiles(
  spaces: ReadonlyMap<string, SpaceJson>,
  prefabs: ReadonlyMap<string, SpaceJson>,
  record: (key: string) => unknown,
): Record<string, PackTiles> {
  const all = Object.fromEntries(prefabs);
  const tiles: Record<string, PackTiles> = {};
  for (const [id, space] of spaces) {
    const packed = is2d(space) ? packTilesOf(space, all, (t) => tilesetIn(record(`${TILESET}:${t}`))) : undefined;
    if (packed) tiles[id] = packed;
  }
  return tiles;
}
