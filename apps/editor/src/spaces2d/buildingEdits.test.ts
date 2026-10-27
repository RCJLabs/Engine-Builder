/**
 * A building's edits (M7.3, D85, docs/specs/rooms.md#the-editor): the slot and place under a point, rooms
 * placed over the slots a stroke crossed and the ones in the way replaced, a room erased, stairs added and
 * taken out, and floors added and taken off.
 */
import type { BuildingFields, SpaceJson } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import {
  addFloor,
  eraseRoom,
  floorAt,
  newBuilding,
  placeRoom,
  removeTopFloor,
  slotAt,
  toggleStair,
  withBuilding,
} from './buildingEdits.ts';

const EMPTY: BuildingFields = { slot: [48, 32], slots: 3, floors: 2, rooms: [], stairs: [] };
const AT = [100, 10] as const;

describe('the place under a point', () => {
  it('is the floor and slot it is in, or none off the building', () => {
    expect(slotAt(EMPTY, AT, [100, 10])).toEqual({ floor: 0, slot: 0 });
    expect(slotAt(EMPTY, AT, [148, 41.9])).toEqual({ floor: 0, slot: 1 });
    expect(slotAt(EMPTY, AT, [243, 73])).toEqual({ floor: 1, slot: 2 });
    for (const point of [
      [99, 10],
      [244, 10],
      [100, 9],
      [100, 74],
    ] as const)
      expect(slotAt(EMPTY, AT, point)).toBeUndefined();
    expect(floorAt(EMPTY, AT, [130.7, 50])).toEqual({ floor: 1, x: 30 });
  });
});

describe('rooms', () => {
  it('are placed over the slots a stroke crossed, either way, with a span past one', () => {
    const one = placeRoom(EMPTY, 'cell', 0, 1, 1);
    expect(one.rooms).toEqual([{ id: 'cell', room: 'cell', floor: 0, slot: 1 }]);
    expect(placeRoom(EMPTY, 'hall', 1, 2, 0).rooms).toEqual([{ id: 'hall', room: 'hall', floor: 1, slot: 0, span: 3 }]);
    // Past the last slot or under the ground, the stroke is kept to the building.
    expect(placeRoom(EMPTY, 'hall', 1, 1, 9).rooms).toEqual([{ id: 'hall', room: 'hall', floor: 1, slot: 1, span: 2 }]);
    expect(placeRoom(EMPTY, 'hall', 2, 0, 0)).toBe(EMPTY);
  });

  it('replace the rooms in their way, and take ids of their own', () => {
    const two = placeRoom(placeRoom(EMPTY, 'cell', 0, 0, 0), 'cell', 0, 1, 1);
    expect(two.rooms.map((r) => r.id)).toEqual(['cell', 'cell-2']);
    const hall = placeRoom(two, 'hall', 0, 0, 1);
    expect(hall.rooms).toEqual([{ id: 'hall', room: 'hall', floor: 0, slot: 0, span: 2 }]);
    // A one-slot room on a hall's second slot takes the whole hall away.
    expect(placeRoom(hall, 'cell', 0, 1, 1).rooms).toEqual([{ id: 'cell', room: 'cell', floor: 0, slot: 1 }]);
  });

  it('are erased by any slot they take, and nothing else changes', () => {
    const hall = placeRoom(placeRoom(EMPTY, 'hall', 0, 0, 1), 'cell', 1, 0, 0);
    expect(eraseRoom(hall, 0, 1).rooms.map((r) => r.id)).toEqual(['cell']);
    expect(eraseRoom(hall, 1, 2)).toBe(hall);
  });
});

describe('stairs', () => {
  it('are added at a press, taken out by a press near one, and never climb from the top floor', () => {
    const one = toggleStair(EMPTY, 0, 20);
    expect(one.stairs).toEqual([{ floor: 0, x: 20 }]);
    expect(toggleStair(one, 0, 26).stairs).toEqual([]);
    expect(toggleStair(one, 0, 27).stairs).toEqual([
      { floor: 0, x: 20 },
      { floor: 0, x: 27 },
    ]);
    expect(toggleStair(EMPTY, 1, 20)).toBe(EMPTY);
    expect(toggleStair(EMPTY, 0, 144)).toBe(EMPTY);
  });
});

describe('floors', () => {
  it('are added on top, and the top taken off only while nothing stands on it or climbs to it', () => {
    expect(addFloor(EMPTY).floors).toBe(3);
    expect(addFloor({ ...EMPTY, floors: 64 }).floors).toBe(64);
    expect(removeTopFloor(EMPTY)).toEqual({ ...EMPTY, floors: 1 });
    expect(removeTopFloor({ ...EMPTY, floors: 1 })).toBe('A building has one floor at least.');
    expect(removeTopFloor(placeRoom(EMPTY, 'cell', 1, 0, 0))).toBe('A room stands on floor 1: erase it first.');
    expect(removeTopFloor(toggleStair(EMPTY, 0, 10))).toBe('A stair climbs to floor 1: take it out first.');
  });
});

describe('a new building', () => {
  it('is a box with no rooms or stairs, and its fields written back whole', () => {
    const made = newBuilding([48, 32], 2, 3, 'ladder');
    expect(made).toEqual({
      id: 'building',
      shape: 'box',
      components: { building: { slot: [48, 32], slots: 2, floors: 3, rooms: [], stairs: [], stair: 'ladder' } },
    });
    expect(newBuilding([16, 16], 1, 1).components?.building).not.toHaveProperty('stair');
    const space = { name: 'S', view: '2d', objects: [made, { id: 'crate', shape: 'box' }] } as SpaceJson;
    const next = withBuilding(space, 'building', addFloor(EMPTY));
    expect(next.objects[0]?.components?.building).toEqual({ ...EMPTY, floors: 3 });
    expect(next.objects[1]).toBe(space.objects[1]);
  });
});
