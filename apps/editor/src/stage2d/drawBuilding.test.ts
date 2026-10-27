/**
 * A building drawn on a canvas (M7.3, D85, docs/specs/rooms.md#the-stage): each piece from its sprite's frame
 * on the sheet, a piece cut short at a room's right edge showing its frame's left columns and one cut short at
 * a floor's top showing its frame's bottom rows, at whole pixels on the canvas.
 */
import type { SpriteRecord } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { drawFrame, type Sheets } from './draw.ts';
import type { Item } from './scene.ts';

const sprite = (frame: [number, number]): SpriteRecord => ({
  sheet: 's.png',
  frame,
  clips: { still: { frames: [0, 0], fps: 1 } },
});
const RECORDS: Record<string, SpriteRecord> = { 'room-narrow': sprite([40, 32]), ladder: sprite([8, 12]) };
const SHEETS: Sheets = {
  record: (id) => RECORDS[id],
  image: (id) => ({ id }) as unknown as CanvasImageSource,
  width: (id) => RECORDS[id]?.frame[0] ?? 0,
};

const TOWER: Item = {
  path: 'tower',
  at: [0, 0],
  depth: 0,
  scale: [1, 1],
  look: {
    kind: 'building',
    building: {
      slot: [48, 32],
      slots: 1,
      floors: 2,
      rooms: [{ id: 'gallery', room: 'narrow', floor: 0, slot: 0 }],
      stairs: [{ floor: 0, x: 24 }],
      stair: 'ladder',
    },
    sprites: { narrow: 'room-narrow' },
  },
};

describe('a building drawn', () => {
  it('cuts a room at its right edge and a stair at the floor above, each from its frame on the sheet', () => {
    const calls: unknown[][] = [];
    const ctx = {
      imageSmoothingEnabled: true,
      fillStyle: '',
      fillRect: () => {},
      drawImage: (...args: unknown[]) => calls.push(args.slice(1)),
    } as unknown as CanvasRenderingContext2D;
    const drawn = drawFrame(ctx, {
      items: [TOWER],
      sheets: SHEETS,
      walking: new Map(),
      camera: [24, 32],
      view: [48, 64],
      t: 0,
      still: true,
      backdrop: '#000',
    });
    // The canvas is 64 rows, its foot world y 0: a piece's top is at 64 − (y + h).
    expect(calls).toEqual([
      // The gallery's frame is 40 wide in a slot of 48: all of it, then its left 8 columns.
      [0, 0, 40, 32, 0, 32, 40, 32],
      [0, 0, 8, 32, 40, 32, 8, 32],
      // The ladder's 12-row frame up a floor of 32: 12, 12, then its bottom 8 rows.
      [0, 0, 8, 12, 20, 52, 8, 12],
      [0, 0, 8, 12, 20, 40, 8, 12],
      [0, 4, 8, 8, 20, 32, 8, 8],
    ]);
    expect(drawn).toEqual([{ path: 'tower', at: [0, 0], flip: false, box: { x: 0, y: 0, w: 48, h: 64 } }]);
  });
});
