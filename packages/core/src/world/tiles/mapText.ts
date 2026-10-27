/**
 * Space-Wrecked's battle map text (M7.2, D84, docs/specs/tilemaps.md#a-tilemap; from space-wrecked's
 * src/sim/mapText.js): two characters a tile each way. Even lines are edge rows, a tile's north edge at
 * column 2c + 1 and a corner at 2c; odd lines hold a tile's west edge at 2c and the tile at 2c + 1.
 * Trailing spaces may be left off. Unlike Space-Wrecked's reader, the last line and column are kept:
 * the map's south and east borders are edges too.
 */

/** The four kinds of edge, as Space-Wrecked has them. */
export type EdgeKind = 'wall' | 'hull' | 'door' | 'hatch';

export const EDGE_KINDS: readonly EdgeKind[] = ['wall', 'hull', 'door', 'hatch'];

/** What each edge character stands for, either way round (mapText.js's EDGE_CHARS). */
export const EDGE_CHARS: Readonly<Record<string, EdgeKind>> = {
  '-': 'wall',
  '|': 'wall',
  '=': 'hull',
  I: 'hull',
  '/': 'door',
  o: 'hatch',
};

/** Each kind as written on an edge between rows (across) and between columns (down). */
export const ACROSS: Readonly<Record<EdgeKind, string>> = { wall: '-', hull: '=', door: '/', hatch: 'o' };
export const DOWN: Readonly<Record<EdgeKind, string>> = { wall: '|', hull: 'I', door: '/', hatch: 'o' };

/**
 * A map's edges as two grids, row 0 first: `across[r][c]` the edge on the north of tile (c, r), r from 0
 * to rows (the last the south border); `down[r][c]` the edge on its west, c from 0 to cols (the last the
 * east border). Null where none stands.
 */
export interface Edges {
  readonly across: readonly (readonly (EdgeKind | null)[])[];
  readonly down: readonly (readonly (EdgeKind | null)[])[];
}

const charAt = (lines: readonly string[], line: number, column: number): string => lines[line]?.[column] ?? ' ';

/** The edges a map text gives a map of `cols` by `rows`; characters that aren't edges count as none. */
export function readEdges(lines: readonly string[], cols: number, rows: number): Edges {
  const kind = (ch: string) => (Object.hasOwn(EDGE_CHARS, ch) ? (EDGE_CHARS[ch] as EdgeKind) : null);
  const across = Array.from({ length: rows + 1 }, (_, r) =>
    Array.from({ length: cols }, (_, c) => kind(charAt(lines, 2 * r, 2 * c + 1))),
  );
  const down = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols + 1 }, (_, c) => kind(charAt(lines, 2 * r + 1, 2 * c))),
  );
  return { across, down };
}

/**
 * The edges written back as map text, every line its full 2 × cols + 1: `+` at each corner an edge
 * meets, tiles' places blank.
 */
export function edgesText(edges: Edges, cols: number, rows: number): string[] {
  const at = (r: number, c: number) => edges.across[r]?.[c] ?? null;
  const side = (r: number, c: number) => edges.down[r]?.[c] ?? null;
  const lines: string[] = [];
  for (let r = 0; r <= rows; r++) {
    let edgeRow = '';
    for (let c = 0; c <= cols; c++) {
      const meets = at(r, c - 1) ?? at(r, c) ?? side(r - 1, c) ?? side(r, c);
      edgeRow += meets === null ? ' ' : '+';
      if (c < cols) {
        const across = at(r, c);
        edgeRow += across === null ? ' ' : ACROSS[across];
      }
    }
    lines.push(edgeRow);
    if (r === rows) break;
    let tileRow = '';
    for (let c = 0; c <= cols; c++) {
      const down = side(r, c);
      tileRow += down === null ? ' ' : DOWN[down];
      if (c < cols) tileRow += ' ';
    }
    lines.push(tileRow);
  }
  return lines;
}

/** The size a map text is drawn at: half its widest line, and half its lines. */
export function mapTextSize(lines: readonly string[]): readonly [number, number] {
  const width = Math.max(0, ...lines.map((line) => line.length));
  return [Math.floor(width / 2), Math.floor((lines.length - 1) / 2)];
}

/** Whether text is map text: an odd number of lines, its even ones holding only corners, edges and spaces, and some corner. */
export function isMapText(lines: readonly string[]): boolean {
  if (lines.length < 3 || lines.length % 2 === 0) return false;
  const edgeRow = /^[+\-=/o ]*$/;
  return (
    lines.every((line, i) => i % 2 === 1 || edgeRow.test(line)) &&
    lines.some((line, i) => i % 2 === 0 && line.includes('+'))
  );
}

/** The tiles of a map text, one string a row, one character a tile, trailing spaces dropped. */
export function mapTextTiles(lines: readonly string[]): string[] {
  const [cols, rows] = mapTextSize(lines);
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => charAt(lines, 2 * r + 1, 2 * c + 1))
      .join('')
      .replace(/ +$/, ''),
  );
}

/** Text with its blank lines at the start and end dropped, as pasted text comes. */
export function trimLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 0 && (lines[0] as string).trim() === '') lines.shift();
  while (lines.length > 0 && (lines[lines.length - 1] as string).trim() === '') lines.pop();
  return lines;
}
