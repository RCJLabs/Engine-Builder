/**
 * A tilemap's edits as plain functions (M7.2, D84, docs/specs/tilemaps.md#the-editor): the cell and
 * the side under a point, painting and erasing, edges set and cleared, and Import ASCII: plain rows,
 * Space-Wrecked's map text with its edges, the size grown, and characters no tile is refused whole.
 */
import type { TilemapFields } from '@eb/compiler';
import { readEdges } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { tilePainter } from './painter2d.ts';
import { cellAt, importText, nearestSide, newTilemap, paintCells, setEdges, withTilemap } from './tilemapEdits.ts';

const MAP = { at: [32, 16] as const, size: [3, 2] as const, tile: [16, 16] as const };
const fields = (rows: string[] = [], edges?: string[]): TilemapFields => ({
  tileset: 'deck',
  size: [3, 2],
  layers: [{ id: 'floor', rows }],
  ...(edges ? { edges } : {}),
});
const CHARS = new Set(['.', '#', 'h', 'a', 'H', 'c', '%']);

describe('a point on a tilemap', () => {
  it('is in the cell under it, row 0 the top, and nearest one of its sides', () => {
    expect(cellAt(MAP, [32, 47])).toEqual([0, 0]);
    expect(cellAt(MAP, [79, 16])).toEqual([2, 1]);
    expect(cellAt(MAP, [80, 16])).toBeUndefined();
    expect(cellAt(MAP, [32, 48])).toBeUndefined();
    expect(nearestSide(MAP, [40, 46])).toEqual({ cell: [0, 0], side: 'n' });
    expect(nearestSide(MAP, [47, 40])).toEqual({ cell: [0, 0], side: 'e' });
    expect(nearestSide(MAP, [40, 33])).toEqual({ cell: [0, 0], side: 's' });
    expect(nearestSide(MAP, [33, 40])).toEqual({ cell: [0, 0], side: 'w' });
    expect(nearestSide(MAP, [0, 0])).toBeUndefined();
  });
});

describe('painting', () => {
  it('sets cells in the layer, padding rows with spaces, and erasing leaves nothing trailing', () => {
    const painted = paintCells(fields(), 0, [[2, 1]], '#');
    expect(painted.layers[0]?.rows).toEqual(['', '  #']);
    const more = paintCells(
      painted,
      0,
      [
        [0, 0],
        [1, 0],
      ],
      '.',
    );
    expect(more.layers[0]?.rows).toEqual(['..', '  #']);
    expect(paintCells(more, 0, [[2, 1]], ' ').layers[0]?.rows).toEqual(['..']);
    expect(
      paintCells(
        more,
        0,
        [
          [0, 0],
          [1, 0],
          [2, 1],
        ],
        ' ',
      ).layers[0]?.rows,
    ).toEqual([]);
    // A layer that isn't there is left alone.
    expect(paintCells(more, 3, [[0, 0]], '#')).toBe(more);
  });
});

describe('edges', () => {
  it('stand on the side asked, one edge seen from both cells, and none leave no edges at all', () => {
    const walled = setEdges(fields(['...', '...']), [{ cell: [0, 0], side: 'e' }], 'wall');
    const read = readEdges(walled.edges ?? [], 3, 2);
    expect(read.down[0]?.[1]).toBe('wall');
    const door = setEdges(walled, [{ cell: [1, 0], side: 'w' }], 'door');
    expect(readEdges(door.edges ?? [], 3, 2).down[0]?.[1]).toBe('door');
    const hull = setEdges(
      door,
      [
        { cell: [0, 0], side: 'n' },
        { cell: [0, 1], side: 's' },
      ],
      'hull',
    );
    expect(readEdges(hull.edges ?? [], 3, 2).across[0]?.[0]).toBe('hull');
    expect(readEdges(hull.edges ?? [], 3, 2).across[2]?.[0]).toBe('hull');
    // Written back whole: every line its full width, corners where edges meet.
    expect(hull.edges).toEqual(['+=+    ', '  /    ', '  +    ', '       ', '+=+    ']);
    const cleared = setEdges(
      hull,
      [
        { cell: [1, 0], side: 'w' },
        { cell: [0, 0], side: 'n' },
        { cell: [0, 1], side: 's' },
      ],
      null,
    );
    expect(cleared).not.toHaveProperty('edges');
  });
});

describe('Import ASCII', () => {
  it('takes plain rows a character a tile, growing the size to fit', () => {
    const done = importText(fields(), 0, '\n\n..#..\n.h\n\n', CHARS);
    expect(done).toEqual({ fields: { ...fields(['..#..', '.h']), size: [5, 2] } });
  });

  it('takes Space-Wrecked’s map text, its tiles into the layer and its edges into the map', () => {
    const text = ['+-+-+', '|. .|', '+ +/+', '|.|.|', '+-+-+'].join('\n');
    const done = importText(fields(), 0, text, CHARS);
    if (!('fields' in done)) throw new Error('refused');
    expect(done.fields.layers[0]?.rows).toEqual(['..', '..']);
    expect(done.fields.size).toEqual([3, 2]);
    const edges = readEdges(done.fields.edges ?? [], 3, 2);
    expect(edges.across[1]?.[1]).toBe('door');
    expect(edges.down[1]?.[1]).toBe('wall');
    expect(edges.down[0]?.[1]).toBeNull();
  });

  it('changes nothing while a character is no tile, and says which', () => {
    expect(importText(fields(), 0, '..?x\n.q', CHARS)).toEqual({ unknown: ['?', 'q', 'x'] });
  });
});

describe('a new tilemap', () => {
  it('is a box with one empty layer, and its fields replace those of the object named', () => {
    const made = newTilemap('deck', [11, 5]);
    expect(made).toEqual({
      id: 'tilemap',
      shape: 'box',
      components: { tilemap: { tileset: 'deck', size: [11, 5], layers: [{ id: 'floor', rows: [] }] } },
    });
    const space = { name: 'Deck', objects: [made, { id: 'mark', shape: 'box' as const }] };
    const next = withTilemap(space, 'tilemap', fields(['.']));
    expect(next.objects[0]?.components?.tilemap).toEqual(fields(['.']));
    expect(next.objects[1]).toBe(space.objects[1]);
  });
});

describe('a stroke', () => {
  const ask = (tool: 'paint' | 'erase' | 'edges') => {
    const seen: { preview: (TilemapFields | null)[]; cells: unknown[]; sides: unknown[] } = {
      preview: [],
      cells: [],
      sides: [],
    };
    const painter = tilePainter({
      place: MAP,
      fields: fields(),
      tool,
      layer: 0,
      ch: '#',
      kind: 'wall',
      preview: (f) => seen.preview.push(f),
      commit: (cells, sides) => {
        seen.cells.push(...cells);
        seen.sides.push(...sides);
      },
    });
    return { painter, seen };
  };

  it('fills the cells between two points far apart, previews as it goes and commits once', () => {
    const { painter, seen } = ask('paint');
    painter.at([33, 17]);
    painter.at([79, 17]);
    expect(seen.preview.at(-1)?.layers[0]?.rows).toEqual(['', '###']);
    expect(seen.cells).toEqual([]);
    painter.end();
    expect(seen.cells).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
  });

  it('sets the sides it runs along, and a second finger cancels its preview', () => {
    const { painter, seen } = ask('edges');
    painter.at([33, 31]);
    painter.at([79, 31]);
    painter.end();
    expect(seen.sides.map((s) => (s as { side: string }).side)).toEqual(['n', 'n', 'n']);
    const cancelled = ask('erase');
    cancelled.painter.at([33, 17]);
    cancelled.painter.cancel();
    expect(cancelled.seen.preview.at(-1)).toBeNull();
  });
});
