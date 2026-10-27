/**
 * A tilemap against its tileset and its size (M7.2, D84, docs/specs/tilemaps.md#a-tilemap): each of
 * E093's problems at its layer and row or its edges' line, and each cell's rules from its topmost
 * layer's tile, as format 18 packs them.
 */
import type { TilesetRecord } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { cellRules, type TilemapFields, tilemapProblems } from './tilemaps.ts';

const TILESET: TilesetRecord = {
  sheet: 'deck.png',
  tile: [16, 16],
  tiles: {
    floor: { char: '.', frame: 0, walk: true },
    crate: { char: 'h', frame: 1, cover: 'half' },
    locker: { char: 'H', frame: 2, cover: 'full', blocksSight: true },
  },
  edges: { wall: { across: 3, down: 4 } },
};

const map = (rows: string[], size: [number, number] = [2, 1], edges?: string[]): TilemapFields => ({
  tileset: 'deck',
  size,
  layers: [{ id: 'floor', rows }],
  ...(edges ? { edges } : {}),
});

describe('a tilemap’s problems (E093)', () => {
  it('are none for rows and edges that fit', () => {
    expect(tilemapProblems(map(['.h'], [2, 1], ['+-+', '| |', '+-+']), TILESET)).toEqual([]);
  });

  it('are its size first, alone, when that isn’t 1 to 256 each way', () => {
    expect(tilemapProblems(map(['.?'], [0, 1]), TILESET)).toEqual([['/size', 'A tilemap is 1 to 256 tiles each way']]);
    expect(tilemapProblems(map([], [2, 257]), TILESET)).toHaveLength(1);
  });

  it('are rows past its size, or longer, and characters no tile is', () => {
    expect(tilemapProblems(map(['..', '..']), TILESET)).toEqual([['/layers/0/rows', 'It has 2 rows: the map has 1']]);
    expect(tilemapProblems(map(['...']), TILESET)).toEqual([
      ['/layers/0/rows/0', 'It is 3 tiles long: the map is 2 across'],
    ]);
    expect(tilemapProblems(map(['?x']), TILESET)).toEqual([
      ['/layers/0/rows/0', '“?”, “x” are no tile of the tileset'],
    ]);
    // With no tileset, its characters are left to the tileset field's own missing reference.
    expect(tilemapProblems(map(['?']), undefined)).toEqual([]);
  });

  it('are edges of the wrong shape, each at its line', () => {
    const edges = (lines: string[]) => tilemapProblems(map(['..'], [2, 1], lines), TILESET);
    expect(edges(['', '', '', ''])).toEqual([['/edges', 'Its edges are 4 lines: a map of 1 rows has 3']]);
    expect(edges(['+-+-+-'])).toEqual([['/edges/0', 'It is 6 long: a map 2 across is 5']]);
    const row = 'An edge row holds + at its corners and - = / o on its edges';
    expect(edges(['+|+'])).toEqual([['/edges/0', row]]);
    expect(edges(['x-+'])).toEqual([['/edges/0', row]]);
    const tiles = 'A tile row holds | I / o on its edges and no tiles: the tiles are the layers’';
    expect(edges(['', '|.|'])).toEqual([['/edges/1', tiles]]);
    expect(edges(['', '- |'])).toEqual([['/edges/1', tiles]]);
  });

  it('are edges whose tileset has none to draw them with', () => {
    const { edges: _, ...plain } = TILESET;
    expect(tilemapProblems(map(['..'], [2, 1], ['+-+']), plain)).toEqual([
      ['/edges', 'Its tileset has no edges to draw these with'],
    ]);
    expect(tilemapProblems(map(['..'], [2, 1], ['', '  ']), plain)).toEqual([]);
  });
});

describe('a cell’s rules', () => {
  it('are its topmost layer’s tile, or none where no layer fills it', () => {
    const fields: TilemapFields = {
      tileset: 'deck',
      size: [3, 1],
      layers: [
        { id: 'floor', rows: ['...'] },
        { id: 'things', rows: [' hH'] },
      ],
    };
    // Walk 1, blocks sight 2, half cover 4, full cover 8.
    expect(cellRules(fields, TILESET)).toEqual(['14a']);
    expect(cellRules({ ...fields, layers: [{ id: 'floor', rows: ['. '] }] }, TILESET)).toEqual(['100']);
  });
});
