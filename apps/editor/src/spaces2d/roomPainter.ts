/**
 * A stroke of Place, Erase or Stairs over a building (M7.3, D85, docs/specs/rooms.md#the-editor): Place
 * takes the floor and slot of its first press and spans the room along that floor to the slot under the
 * pointer, either way; Erase and Stairs act on the first press alone. The building as the stroke would
 * leave it is previewed as it goes; its end keeps the change once, as one step, worked on the file as it
 * then stands.
 */
import type { BuildingFields } from '@eb/compiler';
import type { Point } from '../stage2d/camera.ts';
import { eraseRoom, floorAt, placeRoom, slotAt, toggleStair } from './buildingEdits.ts';
import type { Painter } from './gestures2d.ts';

export type BuildingChange = (fields: BuildingFields) => BuildingFields;

export interface RoomAsk {
  /** The building's bottom-left corner, in world art pixels. */
  readonly at: Point;
  readonly fields: BuildingFields;
  readonly tool: 'place' | 'erase' | 'stairs';
  /** The room record Place lays. */
  readonly room: string;
  preview(fields: BuildingFields | null): void;
  commit(change: BuildingChange, label: string): void;
}

export function roomPainter(ask: RoomAsk): Painter {
  let change: BuildingChange | null = null;
  let label = '';
  let first: { floor: number; slot: number } | undefined;
  const slotOf = (p: Point) =>
    Math.min(ask.fields.slots - 1, Math.max(0, Math.floor((p[0] - ask.at[0]) / ask.fields.slot[0])));
  const place = (p: Point) => {
    first ??= slotAt(ask.fields, ask.at, p);
    if (!first) return;
    const { floor, slot } = first;
    const to = slotOf(p);
    const span = Math.abs(to - slot) + 1;
    change = (fields) => placeRoom(fields, ask.room, floor, slot, to);
    label = span === 1 ? 'Place a room' : `Place a room over ${span} slots`;
  };
  const once = (p: Point) => {
    if (change) return;
    if (ask.tool === 'erase') {
      const on = slotAt(ask.fields, ask.at, p);
      if (on) [change, label] = [(fields) => eraseRoom(fields, on.floor, on.slot), 'Erase a room'];
    } else {
      const on = floorAt(ask.fields, ask.at, p);
      if (!on) return;
      const had = ask.fields.stairs.length;
      change = (fields) => toggleStair(fields, on.floor, on.x);
      label = change(ask.fields).stairs.length < had ? 'Take out a stair' : 'Add a stair';
    }
  };
  return {
    at(p) {
      if (ask.tool === 'place') place(p);
      else once(p);
      ask.preview(change ? change(ask.fields) : null);
    },
    end() {
      if (change && change(ask.fields) !== ask.fields) ask.commit(change, label);
      else ask.preview(null);
    },
    cancel() {
      ask.preview(null);
    },
  };
}
