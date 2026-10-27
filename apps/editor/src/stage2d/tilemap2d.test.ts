/**
 * A tilemap in the 2D stage (M7.2, D84, docs/specs/tilemaps.md#the-stage): each layer's frames with
 * the autotile mask, edges and posts centred on their lines, a point's tile, and walkers that route
 * round walls tile centre to tile centre, or stay put when they can't.
 */
import type { TilemapFields } from '@eb/compiler';
import { edgesText, type PackTiles, readEdges } from '@eb/core';
import type { TilesetRecord } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { cellFrames, joinMask, tileCentre, tileDraws, tileUnder } from './tilemap2d.ts';
import { sendTo, stepWalker, walkerOf } from './walkers.ts';

const TILESET: TilesetRecord = {
  sheet: 'deck.png',
  tile: [16, 16],
  tiles: {
    floor: { char: '.', frame: 0, walk: true },
    crate: { char: 'h', frame: 2, cover: 'half' },
    machinery: { char: '#', frame: 16, cover: 'full', blocksSight: true, joins: true },
  },
  edges: { wall: { across: 48, down: 49 }, door: { across: 52, down: 53 }, post: 56 },
};

const map = (rows: string[][], size: [number, number], edges?: string[]): TilemapFields => ({
  tileset: 'deck',
  size,
  layers: rows.map((layer, i) => ({ id: `l${i}`, rows: layer })),
  ...(edges ? { edges } : {}),
});

describe('a tilemap’s frames', () => {
  it('join the same tile in the same layer by a mask, north 1, east 2, south 4, west 8', () => {
    expect(
      joinMask(
        [
          ['#', '#'],
          ['#', '.'],
        ],
        0,
        0,
        '#',
      ),
    ).toBe(2 | 4);
    expect(
      joinMask(
        [
          ['#', '#'],
          ['#', '.'],
        ],
        1,
        0,
        '#',
      ),
    ).toBe(8);
    expect(
      joinMask(
        [
          ['#', '#'],
          ['#', '.'],
        ],
        0,
        1,
        '#',
      ),
    ).toBe(1);
    // Off the map joins nothing.
    expect(joinMask([['#']], 0, 0, '#')).toBe(0);
    const frames = cellFrames(
      map(
        [
          ['###', '#.h'],
          [' ', '  #'],
        ],
        [3, 2],
      ),
      TILESET,
    );
    expect(frames[0]).toEqual([
      [16 + 2 + 4, 16 + 2 + 8, 16 + 8],
      [16 + 1, 0, 2],
    ]);
    // A later layer's own neighbours: its lone # joins nothing in it, and a space draws nothing.
    expect(frames[1]).toEqual([
      [-1, -1, -1],
      [-1, -1, 16],
    ]);
  });

  it('draw the layers, then each edge centred on its line, then a post where edges meet', () => {
    const draws = tileDraws(map([['.']], [1, 1], ['+-+', '|./', '+-+']), TILESET, [32, 8]);
    expect(draws[0]).toEqual({ frame: 0, box: { x: 32, y: 8, w: 16, h: 16 } });
    expect(draws.slice(1, 3)).toEqual([
      { frame: 48, box: { x: 32, y: 16, w: 16, h: 16 } },
      { frame: 48, box: { x: 32, y: 0, w: 16, h: 16 } },
    ]);
    expect(draws.slice(3, 5)).toEqual([
      { frame: 49, box: { x: 24, y: 8, w: 16, h: 16 } },
      { frame: 53, box: { x: 40, y: 8, w: 16, h: 16 } },
    ]);
    expect(draws.slice(5).map((d) => [d.frame, d.box.x, d.box.y])).toEqual([
      [56, 24, 16],
      [56, 40, 16],
      [56, 24, 0],
      [56, 40, 0],
    ]);
    // A kind the tileset has no frames for draws nothing, though its corners still have their posts.
    expect(tileDraws(map([['.']], [1, 1], ['+=+']), TILESET, [0, 0]).map((d) => d.frame)).toEqual([0, 56, 56]);
  });
});

/** A 2 by 2 deck with a wall between the top two tiles. */
const TILES: PackTiles = {
  object: 'deck',
  at: [100, 0],
  tile: [16, 16],
  size: [2, 2],
  cells: ['11', '11'],
  edges: edgesText(readEdges(['', ' .|.'], 2, 2), 2, 2),
  places: { left: [0, 0], right: [1, 0] },
};

describe('a point on the map', () => {
  it('stands on the tile under it, row 0 the top, and a tile’s centre is in whole pixels', () => {
    expect(tileUnder(TILES, [100, 31])).toEqual([0, 0]);
    expect(tileUnder(TILES, [116, 0])).toEqual([1, 1]);
    expect(tileUnder(TILES, [99, 0])).toBeUndefined();
    expect(tileUnder(TILES, [100, 32])).toBeUndefined();
    expect(tileCentre(TILES, [0, 0])).toEqual([108, 24]);
    expect(tileCentre(TILES, [1, 1])).toEqual([124, 8]);
  });
});

describe('a walker on a tilemap', () => {
  const places = new Map([
    ['left', [106, 20] as const],
    ['right', [126, 26] as const],
  ]);

  it('walks its route round the wall, tile centre to tile centre, then to the mark', () => {
    const walker = walkerOf('ines', [106, 20], 16, undefined);
    sendTo(walker, { goal: 'right' }, places, TILES);
    expect(walker.route).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ]);
    const seen: [number, number][] = [];
    let arrived: string | undefined;
    for (let i = 0; i < 200 && arrived === undefined; i++) {
      arrived = stepWalker(walker, 0.1);
      seen.push([walker.at[0], walker.at[1]]);
    }
    expect(arrived).toBe('right');
    expect(walker.at).toEqual([126, 26]);
    // It went down a row to get round, carrying each frame's step past the centres, and never crossed
    // the wall at x = 116 in the top row.
    expect(seen.some(([, y]) => y < 16)).toBe(true);
    expect(seen.every(([x, y]) => !(y >= 16 && x > 108 && x < 124))).toBe(true);
  });

  it('stays where it is, and never arrives, when no route reaches the mark', () => {
    const walled: PackTiles = { ...TILES, edges: edgesText(readEdges(['', ' .|.', '', ' .|.'], 2, 2), 2, 2) };
    const walker = walkerOf('ines', [106, 20], 16, undefined);
    sendTo(walker, { goal: 'right' }, places, walled);
    expect(walker.route).toBeUndefined();
    for (let i = 0; i < 20; i++) expect(stepWalker(walker, 0.1)).toBeUndefined();
    expect(walker.at).toEqual([106, 20]);
  });

  it('walks straight with no tilemap, as before', () => {
    const walker = walkerOf('ines', [106, 20], 1000, undefined);
    sendTo(walker, { goal: 'right' }, places);
    expect(walker.route).toBeUndefined();
    expect(stepWalker(walker, 1)).toBe('right');
  });
});
