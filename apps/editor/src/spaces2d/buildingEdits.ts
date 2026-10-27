/**
 * A building's edits in the Scene panel's 2D view (M7.3, D85, docs/specs/rooms.md#the-editor), as plain
 * functions of its fields: the slot and the place under a point, a room placed over the slots a stroke
 * crossed (rooms in its way replaced), a room erased, a stair added at a press or taken out under it, and a
 * floor added on top or the top floor taken off while nothing stands on it or climbs to it.
 */
import type { BuildingFields, BuildingRoom, SpaceJson, SpaceObject } from '@eb/compiler';
import { FLOORS_MOST } from '@eb/core';
import type { Point } from '../stage2d/camera.ts';

/** A press within this many art pixels of a stair takes it out rather than adding another. */
export const STAIR_NEAR = 6;

/** The floor and slot under a world point of a building standing at `at`, or undefined off it. */
export function slotAt(fields: BuildingFields, at: Point, point: Point): { floor: number; slot: number } | undefined {
  const [w, h] = fields.slot;
  const slot = Math.floor((point[0] - at[0]) / w);
  const floor = Math.floor((point[1] - at[1]) / h);
  return slot >= 0 && slot < fields.slots && floor >= 0 && floor < fields.floors ? { floor, slot } : undefined;
}

/** The floor and the whole x from the building's left under a world point, or undefined off it. */
export function floorAt(fields: BuildingFields, at: Point, point: Point): { floor: number; x: number } | undefined {
  const found = slotAt(fields, at, point);
  return found ? { floor: found.floor, x: Math.floor(point[0] - at[0]) } : undefined;
}

const covers = (room: BuildingRoom, floor: number, slot: number) =>
  room.floor === floor && slot >= room.slot && slot < room.slot + (room.span ?? 1);

/** An id for a room of record `room` no other room of the building has: the record's, then numbered. */
function freshId(rooms: readonly BuildingRoom[], room: string): string {
  const taken = new Set(rooms.map((r) => r.id));
  if (!taken.has(room)) return room;
  let n = 2;
  while (taken.has(`${room}-${n}`)) n++;
  return `${room}-${n}`;
}

/** The fields with room record `room` over slots `from` to `to` of `floor`, either way, the rooms in its way gone. */
export function placeRoom(
  fields: BuildingFields,
  room: string,
  floor: number,
  from: number,
  to: number,
): BuildingFields {
  const [first, last] = [Math.max(0, Math.min(from, to)), Math.min(fields.slots - 1, Math.max(from, to))];
  if (floor < 0 || floor >= fields.floors || last < first) return fields;
  const kept = fields.rooms.filter((r) => {
    for (let s = first; s <= last; s++) if (covers(r, floor, s)) return false;
    return true;
  });
  const span = last - first + 1;
  const placed: BuildingRoom = { id: freshId(kept, room), room, floor, slot: first, ...(span > 1 ? { span } : {}) };
  return { ...fields, rooms: [...kept, placed] };
}

/** The fields without the room on `slot` of `floor`, if there is one. */
export function eraseRoom(fields: BuildingFields, floor: number, slot: number): BuildingFields {
  const rooms = fields.rooms.filter((r) => !covers(r, floor, slot));
  return rooms.length === fields.rooms.length ? fields : { ...fields, rooms };
}

/** The fields with the stair from `floor` near `x` taken out, or a stair added there; none climbs from the top. */
export function toggleStair(fields: BuildingFields, floor: number, x: number): BuildingFields {
  const near = fields.stairs.findIndex((s) => s.floor === floor && Math.abs(s.x - x) <= STAIR_NEAR);
  if (near >= 0) return { ...fields, stairs: fields.stairs.filter((_, i) => i !== near) };
  if (floor < 0 || floor >= fields.floors - 1 || x < 0 || x >= fields.slot[0] * fields.slots) return fields;
  return { ...fields, stairs: [...fields.stairs, { floor, x }] };
}

/** A floor added on top, up to the most a building has. */
export const addFloor = (fields: BuildingFields): BuildingFields =>
  fields.floors >= FLOORS_MOST ? fields : { ...fields, floors: fields.floors + 1 };

/** The top floor taken off, or why not: a room stands on it, a stair climbs to it, or it is the only one. */
export function removeTopFloor(fields: BuildingFields): BuildingFields | string {
  const top = fields.floors - 1;
  if (top === 0) return 'A building has one floor at least.';
  if (fields.rooms.some((r) => r.floor === top)) return `A room stands on floor ${top}: erase it first.`;
  if (fields.stairs.some((s) => s.floor === top - 1)) return `A stair climbs to floor ${top}: take it out first.`;
  return { ...fields, floors: top };
}

/** A new building of `floors` floors of `slots` slots, no rooms and no stairs yet, its object a box. */
export function newBuilding(slot: Point, slots: number, floors: number, stair?: string): SpaceObject {
  const building = { slot: [slot[0], slot[1]], slots, floors, rooms: [], stairs: [], ...(stair ? { stair } : {}) };
  return { id: 'building', shape: 'box', components: { building } };
}

/** The space with the top-level object `id`'s building fields replaced. */
export function withBuilding(space: SpaceJson, id: string, fields: BuildingFields): SpaceJson {
  return {
    ...space,
    objects: space.objects.map((object) =>
      object.id === id ? { ...object, components: { ...object.components, building: { ...fields } } } : object,
    ),
  };
}
