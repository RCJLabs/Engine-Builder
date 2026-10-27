/**
 * A tileset's sheet against its frames (M7.2, D84, docs/specs/tilemaps.md#a-tileset): E092 for a sheet
 * that isn't a PNG or a whole number of tiles, and for each frame past it: a tile's, the last of a
 * joined tile's 16, an edge's and the post's. The sheet's last frame is still on it.
 */
import type { RecordInput } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import type { PngHeader } from './terrains.ts';
import { tilesetDiagnostics } from './tilesets.ts';

// 4 tiles across and 2 down: frames 0 to 7.
const SHEET: PngHeader = { width: 64, height: 32, bitDepth: 8, colorType: 6 };

const record = (value: object): RecordInput => ({
  type: 'tileset',
  id: 'deck',
  file: 'records/tileset/deck.json',
  value: { sheet: 'deck.png', tile: [16, 16], ...value },
});
const said = (value: object, header: PngHeader | null = SHEET) =>
  tilesetDiagnostics(record(value), header).map((d) => [d.code, d.path, d.message]);

describe('a tileset’s sheet (E092)', () => {
  it('is a PNG of whole tiles', () => {
    const tiles = { floor: { char: '.', frame: 0 } };
    expect(said({ tiles }, null)).toEqual([['E092', '/sheet', 'It isn’t a PNG: a sheet is read as one']]);
    expect(said({ tiles }, { ...SHEET, width: 60 })).toEqual([
      ['E092', '/tile', 'The sheet’s 60 by 32 pixels aren’t a whole number of 16 by 16 tiles'],
    ]);
  });

  it('holds every frame a tile draws, up to its last and no further', () => {
    expect(said({ tiles: { floor: { char: '.', frame: 7 } } })).toEqual([]);
    expect(said({ tiles: { floor: { char: '.', frame: 8 } } })).toEqual([
      ['E092', '/tiles/floor/frame', 'Frame 8 is past the sheet: the sheet has 8, from 0 to 7'],
    ]);
    expect(said({ tiles: { hull: { char: '%', frame: 0, joins: true } } })).toEqual([
      ['E092', '/tiles/hull/frame', 'Its 16 joins run to frame 15: the sheet has 8, from 0 to 7'],
    ]);
  });

  it('holds each edge’s frames and the post’s', () => {
    const tiles = { floor: { char: '.', frame: 0 } };
    expect(said({ tiles, edges: { wall: { across: 6, down: 7 }, post: 7 } })).toEqual([]);
    expect(said({ tiles, edges: { wall: { across: 6, down: 8 }, door: { across: 9, down: 1 }, post: 12 } })).toEqual([
      ['E092', '/edges/wall/down', 'Frame 8 is past the sheet: the sheet has 8, from 0 to 7'],
      ['E092', '/edges/door/across', 'Frame 9 is past the sheet: the sheet has 8, from 0 to 7'],
      ['E092', '/edges/post', 'Frame 12 is past the sheet: the sheet has 8, from 0 to 7'],
    ]);
  });
});
