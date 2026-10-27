// The boarding deck's tilemap as Space-Wrecked's battle map (M7.4, D86). The tilemap keeps
// its tiles as rows and its edges as Space-Wrecked's map text with the tiles' places blank, so
// the tiles are put back in their places and the text read as Space-Wrecked reads a ship's
// map. Like a ship's map (mapFromShip.js), it gets a margin of space round what stands on it:
// the tilemap's south and east borders are edges too, and Space-Wrecked's reader reads only a
// tile's north and west edges, so a border needs a row or column of space past it to stand on.
import { TILES } from '../space-wrecked/data/content.ts';
import { type Skin, skinFor } from '../space-wrecked/render/palette.ts';
import { type BattleMap, MARGIN } from '../space-wrecked/sim/map-from-ship.ts';
import { EDGE_CHARS } from '../space-wrecked/sim/map-text.ts';
import { parseMap } from '../space-wrecked/tools/battle-map.ts';

/** A tilemap component as the space's JSON has it. */
export interface Tilemap {
  readonly tileset?: string;
  readonly size: readonly [number, number];
  readonly layers?: readonly { readonly rows: readonly string[] }[];
  readonly edges?: readonly string[];
}

/** A tileset record: each tile's character and what it does. */
export interface Tileset {
  readonly tile?: readonly [number, number];
  readonly tiles?: Readonly<
    Record<string, { readonly char: string; readonly cover?: string; readonly walk?: boolean }>
  >;
}

/** The map text, how wide it is in tiles, and the tilemap's tile under the map's (0, 0). */
export interface DeckText {
  readonly lines: string[];
  readonly width: number;
  readonly origin: [number, number];
}

// Space-Wrecked's tile kind for each of the starter tileset's tiles; a tile it doesn't name
// is a crate, a locker or floor by the cover it gives.
const KINDS: Readonly<Record<string, string>> = {
  floor: 'floor',
  airlock: 'airlock',
  crate: 'half cover',
  console: 'console',
  locker: 'full cover',
  machinery: 'machinery',
  hull: 'hull',
};

/** Each of the tileset's characters as Space-Wrecked's tile kind, or Space-Wrecked's own legend without one. */
export function legendOf(tileset: Tileset | undefined): Record<string, string> {
  if (!tileset?.tiles) return { ...TILES };
  const legend: Record<string, string> = {};
  for (const [id, tile] of Object.entries(tileset.tiles)) {
    if (tile.char in legend) continue;
    const byCover = tile.cover === 'half' ? 'half cover' : tile.cover === 'full' ? 'full cover' : 'floor';
    legend[tile.char] = KINDS[id] ?? byCover;
  }
  return legend;
}

/** The tilemap's character at each cell, a later layer's over an earlier one's, ' ' where none. */
export function cellsOf(map: Tilemap): string[][] {
  const [cols, rows] = map.size;
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ' '));
  for (const layer of map.layers ?? [])
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const ch = layer.rows[r]?.[c] ?? ' ';
        if (ch !== ' ') (cells[r] as string[])[c] = ch;
      }
  return cells;
}

/** The tilemap as map text, with a margin of space round its tiles and edges. */
export function deckMapText(map: Tilemap): DeckText {
  const [cols, rows] = map.size;
  const cells = cellsOf(map);
  // The tilemap's own text: its edges, each tile in its place.
  const text = Array.from({ length: 2 * rows + 1 }, (_, line) => {
    const chars = [...(map.edges?.[line] ?? '').padEnd(2 * cols + 1, ' ').slice(0, 2 * cols + 1)];
    if (line % 2 === 1) for (let c = 0; c < cols; c++) chars[2 * c + 1] = cells[(line - 1) / 2]?.[c] ?? ' ';
    return chars;
  });
  // The tiles anything stands on: a tile, and both sides of an edge.
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const take = (ax: number, ay: number, bx: number, by: number) => {
    [x0, y0, x1, y1] = [Math.min(x0, ax), Math.min(y0, ay), Math.max(x1, bx), Math.max(y1, by)];
  };
  for (const [line, chars] of text.entries())
    for (const [col, ch] of chars.entries()) {
      const [c, r] = [Math.floor(col / 2), Math.floor(line / 2)];
      const tile = line % 2 === 1 && col % 2 === 1;
      if (tile && ch !== ' ') take(c, r, c, r);
      else if (!tile && Object.hasOwn(EDGE_CHARS, ch)) {
        // A north edge lies between rows r - 1 and r; a west edge between columns c - 1 and c.
        if (line % 2 === 0) take(c, r, c, r - 1);
        else take(c, r, c - 1, r);
      }
    }
  if (x0 === Infinity) throw new Error('The tilemap has nothing on it to draw');
  const origin: [number, number] = [x0 - MARGIN, y0 - MARGIN];
  const [width, height] = [x1 - x0 + 1 + 2 * MARGIN, y1 - y0 + 1 + 2 * MARGIN];
  const lines = Array.from({ length: 2 * height + 1 }, (_, line) =>
    Array.from({ length: 2 * width + 1 }, (_, col) => text[line + 2 * origin[1]]?.[col + 2 * origin[0]] ?? ' ')
      .join('')
      .trimEnd(),
  );
  return { lines, width, origin };
}

/** The battle map the tilemap makes, its origin the tilemap's tile under its (0, 0), in the yard's skin. */
export function deckBoard(map: Tilemap, tileset: Tileset | undefined): { map: BattleMap; skin: Skin } {
  const { lines, width, origin } = deckMapText(map);
  // As renderMap prints it: a newline after the last line, which may be blank.
  const battle = parseMap(`${lines.join('\n')}\n`, legendOf(tileset), { width });
  return { map: { ...battle, origin }, skin: skinFor('yard') };
}
