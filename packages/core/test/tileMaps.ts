/**
 * Maps the tile tests share (M7.2, D84): Space-Wrecked's example ship (its tests/golden/example-ship.map.txt,
 * RCJLabs' own, D62) and a packed tilemap from tile rows and map text, as the compiler packs one.
 */
import {
  BLOCKS_SIGHT,
  edgesText,
  FULL_COVER,
  HALF_COVER,
  type PackTiles,
  readEdges,
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

/** A packed tilemap from tile rows and map text, as the compiler packs one. */
export function packed(rows: readonly string[], text: readonly string[], places: PackTiles['places'] = {}): PackTiles {
  const [cols, height] = [Math.max(...rows.map((r) => r.length)), rows.length];
  const cells = rows.map((row) =>
    Array.from({ length: cols }, (_, c) => (RULES[row[c] ?? ' '] ?? 0).toString(16)).join(''),
  );
  const edges = edgesText(readEdges(text, cols, height), cols, height);
  return { object: 'deck', at: [0, 0], tile: [16, 16], size: [cols, height], cells, edges, places };
}
