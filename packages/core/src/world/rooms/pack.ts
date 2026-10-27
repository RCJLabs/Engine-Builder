/**
 * Format 19's buildings (M7.3, D85, docs/specs/rooms.md#the-pack), checked before the sim reads them: each
 * of a space the pack has and not one with a tilemap, its rooms on its slots and floors with none on
 * another's, its stairs from a floor with one above and inside its width, its places on it. What the rooms
 * are is the compiler's to check (E094); the kernel makes sure the building is whole.
 */
import { isRecordId } from '../../records.ts';
import { FLOORS_MOST, type PackBuilding, SLOTS_MOST, widthOf } from './building.ts';

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const whole = (value: unknown, least: number, most = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= least && value <= most;

const tuple = (value: unknown, length: number): value is readonly number[] =>
  Array.isArray(value) && value.length === length && value.every((n) => whole(n, 0));

const isPath = (path: string) => path.split('/').every(isRecordId);

/** What is wrong with a pack world's buildings, or nothing. */
export function buildingsProblem(
  spaces: Readonly<Record<string, unknown>>,
  buildings: unknown,
  tiles: unknown,
): string | undefined {
  if (!isObject(buildings)) return "The pack's buildings are not an object";
  for (const [space, value] of Object.entries(buildings)) {
    if (!Object.hasOwn(spaces, space)) return `A building of a space the pack lacks: "${space}"`;
    if (isObject(tiles) && Object.hasOwn(tiles, space)) return `"${space}" has a building and a tilemap`;
    const problem = buildingProblem(value);
    if (problem !== undefined) return `The building of "${space}": ${problem}`;
  }
  return undefined;
}

function buildingProblem(value: unknown): string | undefined {
  if (!isObject(value)) return 'not an object';
  const known = ['object', 'at', 'slot', 'slots', 'floors', 'climb', 'rooms', 'stairs', 'places'];
  const unknown = Object.keys(value).filter((key) => !known.includes(key));
  if (unknown.length > 0) return `unknown fields: ${unknown.join(', ')}`;
  const b = value as Partial<Record<keyof PackBuilding, unknown>>;
  if (typeof b.object !== 'string' || !isPath(b.object)) return "its object isn't a path";
  const at = b.at;
  if (!Array.isArray(at) || at.length !== 2 || !at.every((n) => typeof n === 'number' && Number.isFinite(n)))
    return 'its place is not two numbers';
  if (!tuple(b.slot, 2) || !b.slot.every((n) => n >= 1)) return 'its slot is not two whole sizes';
  if (!whole(b.slots, 1, SLOTS_MOST)) return `its slots are not a whole number from 1 to ${SLOTS_MOST}`;
  if (!whole(b.floors, 1, FLOORS_MOST)) return `its floors are not a whole number from 1 to ${FLOORS_MOST}`;
  if (!whole(b.climb, 1)) return 'its climb is not a whole number from 1';
  const shape = { slot: b.slot as readonly [number, number], slots: b.slots, floors: b.floors };
  return roomsProblem(b.rooms, shape) ?? stairsProblem(b.stairs, shape) ?? placesProblem(b.places, shape);
}

type Shape = Pick<PackBuilding, 'slot' | 'slots' | 'floors'>;

function roomsProblem(rooms: unknown, { slots, floors }: Shape): string | undefined {
  if (!isObject(rooms)) return 'its rooms are not an object';
  const taken = new Set<number>();
  for (const [id, room] of Object.entries(rooms)) {
    if (!isRecordId(id)) return `"${id}" is not a room's id`;
    if (!tuple(room, 3)) return `the room "${id}" is not a floor, a slot and a span`;
    const [floor, slot, span] = room as readonly [number, number, number];
    if (floor >= floors || span < 1 || slot + span > slots) return `the room "${id}" is not on the building`;
    for (let s = slot; s < slot + span; s++) {
      if (taken.has(floor * slots + s)) return `the room "${id}" is on another's slot`;
      taken.add(floor * slots + s);
    }
  }
  return undefined;
}

function stairsProblem(stairs: unknown, shape: Shape): string | undefined {
  if (!Array.isArray(stairs)) return 'its stairs are not a list';
  for (const [i, stair] of stairs.entries()) {
    if (!tuple(stair, 2)) return `stair ${i} is not a floor and an x`;
    const [floor, x] = stair as readonly [number, number];
    if (floor >= shape.floors - 1 || x >= widthOf(shape)) return `stair ${i} is not on the building`;
  }
  return undefined;
}

function placesProblem(places: unknown, shape: Shape): string | undefined {
  if (!isObject(places)) return 'its places are not an object';
  for (const [path, place] of Object.entries(places)) {
    if (!isPath(path)) return `"${path}" is not an object's path`;
    if (!tuple(place, 2) || (place[0] as number) >= shape.floors || (place[1] as number) >= widthOf(shape))
      return `"${path}" is not on the building`;
  }
  return undefined;
}
