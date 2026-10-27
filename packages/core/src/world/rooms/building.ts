/**
 * A building as the sim and the stage read it (M7.3, D85, docs/specs/rooms.md#a-building): floors of equal
 * slots counted from the ground up, rooms that span one slot or more, and stairs between a floor and the one
 * above that take no slot. A place in a building is a floor and an x, in whole art pixels from its left.
 */

/** Format 19 (M7.3): a space's building, worked out by the compiler from its component. */
export interface PackBuilding {
  /** The building object's path. */
  readonly object: string;
  /** Its bottom-left corner in art pixels. */
  readonly at: readonly [number, number];
  /** A slot's width and a floor's height, in art pixels. */
  readonly slot: readonly [number, number];
  readonly slots: number;
  readonly floors: number;
  /** What a climb costs a route, in art pixels of walking. */
  readonly climb: number;
  /** Each room by its id in the building: its floor, its first slot and the slots it spans. */
  readonly rooms: Readonly<Record<string, readonly [number, number, number]>>;
  /** Each stair: the floor it climbs from and its x from the building's left, in the file's order. */
  readonly stairs: readonly (readonly [number, number])[];
  /** Each object of the space on the building, by path: its floor and x. */
  readonly places: Readonly<Record<string, FloorPlace>>;
}

/** A floor and an x from the building's left, in whole art pixels. */
export type FloorPlace = readonly [number, number];

/** The most slots a floor has, and the most floors (E094). */
export const SLOTS_MOST = 32;
export const FLOORS_MOST = 64;

/** The building's width in art pixels. */
export const widthOf = (building: Pick<PackBuilding, 'slot' | 'slots'>): number => building.slot[0] * building.slots;

/**
 * The place a point in art pixels (y up) stands on: the floor whose band its feet are in, at its own x, or
 * undefined off the building. A floor's band runs from its foot up to the next floor's.
 */
export function floorPlaceOf(
  building: Pick<PackBuilding, 'at' | 'slot' | 'slots' | 'floors'>,
  [x, y]: readonly [number, number],
): FloorPlace | undefined {
  const dx = Math.floor(x - building.at[0]);
  const floor = Math.floor((y - building.at[1]) / building.slot[1]);
  if (dx < 0 || dx >= widthOf(building) || floor < 0 || floor >= building.floors) return undefined;
  return [floor, dx];
}

/** A place's point in art pixels: its floor's foot, at its x. */
export const pointOf = (building: Pick<PackBuilding, 'at' | 'slot'>, [floor, x]: FloorPlace): [number, number] => [
  building.at[0] + x,
  building.at[1] + floor * building.slot[1],
];

/** The id of the room a place is in, or "" on a bare slot. */
export function roomAt(building: Pick<PackBuilding, 'slot' | 'rooms'>, [floor, x]: FloorPlace): string {
  const slot = Math.floor(x / building.slot[0]);
  for (const id of Object.keys(building.rooms).sort()) {
    const [f, first, span] = building.rooms[id] as readonly [number, number, number];
    if (f === floor && slot >= first && slot < first + span) return id;
  }
  return '';
}
