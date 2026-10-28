/**
 * Maps the tile tests share (M7.2, D84): Space-Wrecked's example ship (its tests/golden/example-ship.map.txt,
 * RCJLabs' own, D62) and a packed tilemap from tile rows and map text, as the compiler packs one.
 */
import {
  BLOCKS_SIGHT,
  type EdgeKind,
  edgesText,
  FULL_COVER,
  HALF_COVER,
  type PackTiles,
  readEdges,
  type Side,
  WALK,
} from '../src/world/tiles/index.ts';

/** Space-Wrecked's example ship, as its battle map prints it. */
export const SHIP = [
  '      +=+=+=+=+=+=+',
  '      Ih h ./. . .I',
  '  +=+=+     +     +=+=+',
  '  I# ./. . .|. # ./. cI',
  '  +   +-+/+-+     +   +',
  '  I# ./. . ./. . .|. .I',
  '  +/+-+/+-+/+/+/+=+   +',
  '  I# ./H ./a a/cI%I. cI',
  '  +   +=+=+o+=+=+ +=+=+',
  '  I# .I',
  '  +=+=+',
];

/** Space-Wrecked's rules (data/tiles.json) by its characters, as a cell's digit. */
const RULES: Readonly<Record<string, number>> = {
  '.': WALK,
  a: WALK,
  h: HALF_COVER,
  c: HALF_COVER,
  H: FULL_COVER | BLOCKS_SIGHT,
  '#': FULL_COVER | BLOCKS_SIGHT,
  '%': FULL_COVER | BLOCKS_SIGHT,
};

/**
 * An open room of floor, cols × rows, changed a tile or an edge at a time, then packed (M7.5; space-wrecked's
 * tests/battleKit.js openMap, put and wall).
 */
export function room(cols: number, rows: number) {
  const cells = Array.from({ length: rows }, () => Array<number>(cols).fill(WALK));
  const across = Array.from({ length: rows + 1 }, () => Array<EdgeKind | null>(cols).fill(null));
  const down = Array.from({ length: rows }, () => Array<EdgeKind | null>(cols + 1).fill(null));
  const made = {
    put(c: number, r: number, rule: number) {
      (cells[r] as number[])[c] = rule;
      return made;
    },
    wall(c: number, r: number, side: Side, kind: EdgeKind = 'wall') {
      if (side === 'n' || side === 's') (across[side === 'n' ? r : r + 1] as (EdgeKind | null)[])[c] = kind;
      else (down[r] as (EdgeKind | null)[])[side === 'w' ? c : c + 1] = kind;
      return made;
    },
    tiles(places: PackTiles['places'] = {}): PackTiles {
      return {
        object: 'room',
        at: [0, 0],
        tile: [16, 16],
        size: [cols, rows],
        cells: cells.map((row) => row.map((rule) => rule.toString(16)).join('')),
        edges: edgesText({ across, down }, cols, rows),
        places,
      };
    },
  };
  return made;
}

/** A packed tilemap from tile rows and map text, as the compiler packs one. */
export function packed(rows: readonly string[], text: readonly string[], places: PackTiles['places'] = {}): PackTiles {
  const [cols, height] = [Math.max(...rows.map((r) => r.length)), rows.length];
  const cells = rows.map((row) =>
    Array.from({ length: cols }, (_, c) => (RULES[row[c] ?? ' '] ?? 0).toString(16)).join(''),
  );
  const edges = edgesText(readEdges(text, cols, height), cols, height);
  return { object: 'deck', at: [0, 0], tile: [16, 16], size: [cols, height], cells, edges, places };
}
