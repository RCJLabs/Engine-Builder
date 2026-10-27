/**
 * The starter tileset (M7.2, D84, docs/specs/tilemaps.md#the-starter-tileset): a ship's deck in
 * 16-pixel tiles, in the starter palette, written as Space-Wrecked's characters. Its sheet's first
 * row holds the floor, the airlock, a crate, a console and a locker; its second the machinery's 16
 * joins and its third the hull's, frame `first + mask` for the neighbours it joins (north 1, east 2,
 * south 4, west 8); its fourth the edges, each drawn centred on its frame as the stage centres it on
 * the edge's line, and the post.
 */
import type { TilesetEdges, TilesetRecord, TilesetTile } from '@eb/schema';
import type { Colour } from './palette.ts';
import { type Frame, hash, Sheet } from './raster.ts';

const TILE = 16;
const ACROSS = 16;
const ROWS = 4;

export const DECK_TILES: Readonly<Record<string, TilesetTile>> = {
  floor: { char: '.', frame: 0, walk: true },
  airlock: { char: 'a', frame: 1, walk: true },
  crate: { char: 'h', frame: 2, cover: 'half' },
  console: { char: 'c', frame: 3, cover: 'half' },
  locker: { char: 'H', frame: 4, cover: 'full', blocksSight: true },
  machinery: { char: '#', frame: 16, cover: 'full', blocksSight: true, joins: true },
  hull: { char: '%', frame: 32, cover: 'full', blocksSight: true, joins: true },
};

export const DECK_EDGES: TilesetEdges = {
  wall: { across: 48, down: 49 },
  hull: { across: 50, down: 51 },
  door: { across: 52, down: 53 },
  hatch: { across: 54, down: 55 },
  post: 56,
};

export const deckTileset = (sheet: string): TilesetRecord => ({
  name: 'Deck',
  sheet,
  tile: [TILE, TILE],
  tiles: DECK_TILES,
  edges: DECK_EDGES,
});

/** Deck plating: dark plates seamed in ink at their left and foot, a rivet at each corner. */
function plating(f: Frame, seed: number, colour: Colour = 'stoneDark'): void {
  f.rect(0, 0, TILE, TILE, colour);
  for (let i = 0; i < TILE; i++) {
    f.set(i, 0, 'ink');
    f.set(0, i, 'ink');
  }
  for (const [x, y] of [
    [2, 2],
    [13, 2],
    [2, 13],
    [13, 13],
  ] as const)
    f.set(x, y, 'stone');
  for (let y = 1; y < TILE; y++) for (let x = 1; x < TILE; x++) if (hash(seed, x, y) % 29 === 0) f.set(x, y, 'dusk');
}

function airlock(f: Frame): void {
  plating(f, 2, 'stone');
  // Hazard stripes round its rim, two pixels wide, on a slant.
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const rim = x < 2 || y < 2 || x >= TILE - 2 || y >= TILE - 2;
      if (rim) f.set(x, y, ((x + y) >> 1) % 2 === 0 ? 'glow' : 'ink');
    }
}

function crate(f: Frame): void {
  plating(f, 3);
  f.rect(2, 1, 12, 11, 'wood');
  for (let i = 0; i < 11; i++) f.set(3 + Math.floor((i * 10) / 11), 1 + i, 'ember');
  f.rect(2, 11, 12, 1, 'ember');
  outlineBox(f, 2, 1, 12, 11);
}

function console_(f: Frame): void {
  plating(f, 4);
  f.rect(1, 1, 14, 9, 'stone');
  f.rect(3, 4, 10, 4, 'blue');
  f.rect(4, 6, 6, 1, 'star');
  f.set(4, 2, 'glow');
  f.set(6, 2, 'red');
  f.set(8, 2, 'glow');
  outlineBox(f, 1, 1, 14, 9);
}

function locker(f: Frame): void {
  plating(f, 5);
  f.rect(1, 1, 14, 14, 'stoneLight');
  f.rect(8, 1, 1, 14, 'stone');
  for (const y of [11, 12]) f.rect(3, y, 3, 1, 'ink');
  f.set(6, 7, 'ink');
  f.set(10, 7, 'ink');
  outlineBox(f, 1, 1, 14, 14);
}

/** An ink line round a box drawn at (x, y), w by h. */
function outlineBox(f: Frame, x: number, y: number, w: number, h: number): void {
  for (let i = 0; i < w; i++) {
    f.set(x + i, y, 'ink');
    f.set(x + i, y + h - 1, 'ink');
  }
  for (let i = 0; i < h; i++) {
    f.set(x, y + i, 'ink');
    f.set(x + w - 1, y + i, 'ink');
  }
}

/** A joined tile: its fill, and on each side it doesn't join, an ink rim with `rim` inside it. */
function joined(f: Frame, mask: number, fill: (f: Frame) => void, rim: Colour): void {
  fill(f);
  const last = TILE - 1;
  const sides: [number, (i: number, depth: number) => [number, number]][] = [
    [1, (i, d) => [i, last - d]],
    [2, (i, d) => [last - d, i]],
    [4, (i, d) => [i, d]],
    [8, (i, d) => [d, i]],
  ];
  for (const [bit, at] of sides) {
    if ((mask & bit) !== 0) continue;
    for (let i = 0; i < TILE; i++) f.set(...at(i, 1), rim);
  }
  for (const [bit, at] of sides) {
    if ((mask & bit) !== 0) continue;
    for (let i = 0; i < TILE; i++) f.set(...at(i, 0), 'ink');
  }
}

/** Machinery: pipes along it on dark plate, a warning light here and there. */
function pipes(f: Frame): void {
  f.rect(0, 0, TILE, TILE, 'stoneDark');
  for (const y of [3, 10]) {
    f.rect(0, y, TILE, 3, 'stone');
    f.rect(0, y + 2, TILE, 1, 'stoneLight');
  }
  f.set(7, 7, 'ember');
  f.set(8, 7, 'flame');
}

/** The hull: plates of dusk seamed with the ridge's blue, riveted. */
function plates(f: Frame): void {
  f.rect(0, 0, TILE, TILE, 'dusk');
  f.rect(0, 7, TILE, 1, 'ridge');
  f.rect(7, 0, 1, 7, 'ridge');
  for (const [x, y] of [
    [3, 3],
    [11, 3],
    [3, 11],
    [11, 11],
  ] as const)
    f.set(x, y, 'stone');
}

/** A bar of `layers`, from one face to the other, centred across the frame (across) or up it (down). */
function bar(f: Frame, down: boolean, layers: readonly Colour[], from = 0, to = TILE): void {
  const start = TILE / 2 - Math.floor(layers.length / 2);
  layers.forEach((colour, k) => {
    for (let i = from; i < to; i++) {
      if (down) f.set(start + k, i, colour);
      else f.set(i, start + k, colour);
    }
  });
}

const EDGES: readonly ((f: Frame, down: boolean) => void)[] = [
  (f, down) => bar(f, down, ['ink', 'stone', 'stoneLight', 'ink']),
  (f, down) => bar(f, down, ['ink', 'dusk', 'ridge', 'ridge', 'dusk', 'ink']),
  (f, down) => {
    bar(f, down, ['ink', 'stone', 'stoneLight', 'ink']);
    bar(f, down, ['ink', 'red', 'red', 'ink'], 3, TILE - 3);
  },
  (f, down) => {
    bar(f, down, ['ink', 'glow', 'glow', 'ink']);
    for (let i = 0; i < TILE; i += 4) bar(f, down, ['ink', 'ink', 'ink', 'ink'], i, i + 2);
  },
];

/** The deck's sheet: 16 tiles across and 4 rows down, 256 by 64 pixels. */
export function deckSheet(): Sheet {
  const sheet = new Sheet(TILE, TILE, ACROSS, ROWS);
  plating(sheet.frame(0), 1);
  airlock(sheet.frame(1));
  crate(sheet.frame(2));
  console_(sheet.frame(3));
  locker(sheet.frame(4));
  for (let mask = 0; mask < 16; mask++) {
    joined(sheet.frame(16 + mask), mask, pipes, 'stoneLight');
    joined(sheet.frame(32 + mask), mask, plates, 'ridge');
  }
  EDGES.forEach((draw, k) => {
    draw(sheet.frame(48 + 2 * k), false);
    draw(sheet.frame(49 + 2 * k), true);
  });
  const post = sheet.frame(56);
  post.rect(5, 5, 6, 6, 'ink');
  post.rect(6, 6, 4, 4, 'stoneLight');
  return sheet;
}
