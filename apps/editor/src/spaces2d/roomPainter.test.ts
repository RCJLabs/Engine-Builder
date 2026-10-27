/**
 * A stroke over a building (M7.3, D85, docs/specs/rooms.md#the-editor): Place spans the room along the floor
 * of its first press to the slot under the pointer, either way and kept to the building; Erase and Stairs act
 * on the first press alone; each previews as it goes and keeps one step at its end, and a stroke that
 * changes nothing keeps none.
 */
import type { BuildingFields } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { type RoomAsk, roomPainter } from './roomPainter.ts';

const FIELDS: BuildingFields = {
  slot: [48, 32],
  slots: 3,
  floors: 2,
  rooms: [{ id: 'cell', room: 'cell', floor: 0, slot: 2 }],
  stairs: [{ floor: 0, x: 20 }],
};

function stroke(tool: RoomAsk['tool'], points: [number, number][]) {
  const previews: (BuildingFields | null)[] = [];
  const kept: { fields: BuildingFields; label: string }[] = [];
  const painter = roomPainter({
    at: [100, 10],
    fields: FIELDS,
    tool,
    room: 'hall',
    preview: (fields) => previews.push(fields),
    commit: (change, label) => kept.push({ fields: change(FIELDS), label }),
  });
  for (const p of points) painter.at(p);
  painter.end();
  return { previews, kept };
}

describe('a stroke over a building', () => {
  it('places a room along the floor of its first press, to the slot under the pointer, either way', () => {
    const { previews, kept } = stroke('place', [
      [200, 50],
      [160, 70],
      [110, 12],
    ]);
    expect(previews.at(-1)?.rooms.at(-1)).toEqual({ id: 'hall', room: 'hall', floor: 1, slot: 0, span: 3 });
    expect(kept).toHaveLength(1);
    expect(kept[0]?.label).toBe('Place a room over 3 slots');
    expect(kept[0]?.fields.rooms.at(-1)).toEqual({ id: 'hall', room: 'hall', floor: 1, slot: 0, span: 3 });
    // Past the building's right edge, the span stops at the last slot.
    expect(
      stroke('place', [
        [110, 12],
        [400, 12],
      ]).kept[0]?.fields.rooms,
    ).toEqual([{ id: 'hall', room: 'hall', floor: 0, slot: 0, span: 3 }]);
  });

  it('erases the room under its first press, and sets or takes out a stair there', () => {
    expect(
      stroke('erase', [
        [240, 20],
        [110, 20],
      ]).kept[0],
    ).toEqual({ fields: { ...FIELDS, rooms: [] }, label: 'Erase a room' });
    expect(stroke('stairs', [[124, 30]]).kept[0]).toEqual({
      fields: { ...FIELDS, stairs: [] },
      label: 'Take out a stair',
    });
    expect(stroke('stairs', [[150, 30]]).kept[0]?.label).toBe('Add a stair');
    expect(stroke('stairs', [[150, 30]]).kept[0]?.fields.stairs).toEqual([...FIELDS.stairs, { floor: 0, x: 50 }]);
  });

  it('keeps no step when it changes nothing, or begins off the building', () => {
    expect(stroke('erase', [[110, 20]]).kept).toEqual([]);
    expect(
      stroke('place', [
        [50, 20],
        [150, 20],
      ]).kept,
    ).toEqual([]);
    expect(stroke('stairs', [[150, 50]]).kept).toEqual([]);
  });
});
