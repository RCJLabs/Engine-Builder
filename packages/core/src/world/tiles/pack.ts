/**
 * Format 18's tilemaps (M7.2, D84, docs/specs/tilemaps.md#the-pack), checked before the sim reads them:
 * each of a space the pack has, its cells and edges the shape its size gives, its places on the map.
 * What the tiles are is the compiler's to check (E092, E093); the kernel makes sure the grid is whole.
 */
import { isRecordId } from '../../records.ts';
import type { PackTiles } from './grid.ts';

/** The most columns or rows a tilemap has (E093). */
export const TILES_MOST = 256;

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const whole = (value: unknown, least: number, most = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= least && value <= most;

const pair = (value: unknown, ok: (n: unknown) => boolean): value is readonly [number, number] =>
  Array.isArray(value) && value.length === 2 && ok(value[0]) && ok(value[1]);

const isPath = (path: string) => path.split('/').every(isRecordId);

const lines = (value: unknown, count: number, length: number, chars: RegExp): boolean =>
  Array.isArray(value) &&
  value.length === count &&
  value.every((line) => typeof line === 'string' && line.length === length && chars.test(line));

/** What is wrong with a pack world's tiles, or nothing. */
export function tilesProblem(spaces: Readonly<Record<string, unknown>>, tiles: unknown): string | undefined {
  if (!isObject(tiles)) return "The pack's tilemaps are not an object";
  for (const [space, value] of Object.entries(tiles)) {
    if (!Object.hasOwn(spaces, space)) return `A tilemap of a space the pack lacks: "${space}"`;
    const problem = tileProblem(value);
    if (problem !== undefined) return `The tilemap of "${space}": ${problem}`;
  }
  return undefined;
}

function tileProblem(value: unknown): string | undefined {
  if (!isObject(value)) return 'not an object';
  const known = ['object', 'at', 'tile', 'size', 'cells', 'edges', 'places'];
  const unknown = Object.keys(value).filter((key) => !known.includes(key));
  if (unknown.length > 0) return `unknown fields: ${unknown.join(', ')}`;
  const { object, at, tile, size, cells, edges, places } = value as Partial<Record<keyof PackTiles, unknown>>;
  if (typeof object !== 'string' || !isPath(object)) return "its object isn't a path";
  if (!pair(at, (n) => typeof n === 'number' && Number.isFinite(n))) return 'its place is not two numbers';
  if (!pair(tile, (n) => whole(n, 1))) return 'its tile is not two whole sizes';
  if (!pair(size, (n) => whole(n, 1, TILES_MOST))) return `its size is not two whole numbers from 1 to ${TILES_MOST}`;
  const [cols, rows] = size;
  if (!lines(cells, rows, cols, /^[0-9a-f]*$/)) return 'its cells are not a hexadecimal digit for each';
  if (!lines(edges, 2 * rows + 1, 2 * cols + 1, /^[+\-|=I/o ]*$/)) return 'its edges are not map text of its size';
  if (!isObject(places)) return 'its places are not an object';
  for (const [path, place] of Object.entries(places)) {
    if (!isPath(path)) return `"${path}" is not an object's path`;
    if (!pair(place, (n) => whole(n, 0)) || place[0] >= cols || place[1] >= rows) return `"${path}" is not on the map`;
  }
  return undefined;
}
