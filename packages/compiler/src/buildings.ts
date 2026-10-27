/**
 * A 2D space's building (M7.3, D85, docs/specs/rooms.md#a-building): found through its prefabs, held to
 * itself (E094), its floors reached from the ground (W158), and worked out into format 19's building:
 * its rooms by id, its stairs and the place each object stands on.
 */
import { floorPlaceOf, type PackBuilding, widthOf } from '@eb/core';
import { type Diagnostic, type DiagnosticCode, severityOf } from '@eb/schema';
import { eachFlat, type Point } from './flatPlaces.ts';
import { isFields } from './overrides.ts';
import type { SpaceJson } from './spaceShape.ts';
import { is2d } from './spaceView.ts';
import { TILEMAP, tilemapsIn } from './tilemaps.ts';

export const BUILDING = 'building';

export interface BuildingRoom {
  readonly id: string;
  readonly room: string;
  readonly floor: number;
  readonly slot: number;
  readonly span?: number;
}

/** A building component as its file holds it, once its kind's schema passed. */
export interface BuildingFields {
  readonly slot: readonly [number, number];
  readonly slots: number;
  readonly floors: number;
  readonly rooms: readonly BuildingRoom[];
  readonly stairs: readonly { readonly floor: number; readonly x: number }[];
  readonly stair?: string;
  readonly climb?: number;
}

/** A building as placed: the path of the object that holds it, its bottom-left corner and its fields. */
export interface FoundBuilding {
  readonly path: string;
  readonly at: Point;
  readonly fields: BuildingFields;
}

export const isBuilding = (value: unknown): value is BuildingFields =>
  isFields(value) &&
  Array.isArray(value.slot) &&
  typeof value.slots === 'number' &&
  typeof value.floors === 'number' &&
  Array.isArray(value.rooms) &&
  value.rooms.every(isFields) &&
  Array.isArray(value.stairs) &&
  value.stairs.every(isFields);

/** The buildings a space places, through its prefabs, in the file's order. */
export function buildingsIn(space: SpaceJson, prefabs: Readonly<Record<string, unknown>>): FoundBuilding[] {
  const found: FoundBuilding[] = [];
  eachFlat(space, prefabs, (path, seen, place) => {
    const fields = seen.components?.[BUILDING];
    if (isBuilding(fields)) found.push({ path, at: place.at, fields });
  });
  return found;
}

/** E094 for a building against itself: each a path inside the component and why. */
export function buildingProblems(fields: BuildingFields): [string, string][] {
  const found: [string, string][] = [];
  const { slots, floors } = fields;
  const taken = new Map<number, string>();
  const ids = new Set<string>();
  fields.rooms.forEach((room, i) => {
    const at = `/rooms/${i}`;
    const span = room.span ?? 1;
    if (ids.has(room.id)) found.push([`${at}/id`, `Another room is “${room.id}”: a room’s id is its own`]);
    ids.add(room.id);
    if (room.floor >= floors) found.push([`${at}/floor`, `The building has floors 0 to ${floors - 1}`]);
    else if (room.slot + span > slots)
      found.push([at, `It runs to slot ${room.slot + span - 1}: a floor has slots 0 to ${slots - 1}`]);
    else
      for (let s = room.slot; s < room.slot + span; s++) {
        const other = taken.get(room.floor * slots + s);
        if (other !== undefined) {
          found.push([at, `It is on floor ${room.floor}, slot ${s}, which “${other}” takes`]);
          break;
        }
        taken.set(room.floor * slots + s, room.id);
      }
  });
  const width = widthOf(fields);
  fields.stairs.forEach((stair, i) => {
    if (stair.floor >= floors - 1)
      found.push([
        `/stairs/${i}/floor`,
        `A stair climbs from a floor to the one above: the top floor is ${floors - 1}`,
      ]);
    if (stair.x >= width) found.push([`/stairs/${i}/x`, `The building is ${width} art pixels wide`]);
  });
  if (fields.stairs.length > 0 && fields.stair === undefined)
    found.push(['/stair', 'It has stairs and no sprite to draw them with']);
  return found;
}

/**
 * E094 for a building component that passed its kind's schema, each at a path inside it. With `only`,
 * the fields a prefab's override sets, only problems in those are reported: the rest are the prefab's.
 */
export function checkBuildingFields(
  fields: unknown,
  only: ReadonlySet<string> | undefined,
  report: (path: string, message: string) => void,
): void {
  if (!isBuilding(fields)) return;
  for (const [path, message] of buildingProblems(fields))
    if (!only || only.has(path.split('/')[1] ?? '')) report(path, message);
}

/** The floors the ground reaches by stairs, from floor 0 up and down. */
export function floorsReached(fields: Pick<BuildingFields, 'floors' | 'stairs'>): Set<number> {
  const reached = new Set<number>([0]);
  for (let grown = true; grown; ) {
    grown = false;
    for (const { floor } of fields.stairs) {
      if (reached.has(floor) === reached.has(floor + 1) || floor + 1 >= fields.floors) continue;
      reached.add(reached.has(floor) ? floor + 1 : floor);
      grown = true;
    }
  }
  return reached;
}

/**
 * A space's buildings against each other and its tilemap (M7.3): E094 for every building after its first
 * and for a building beside a tilemap, and W158 for each floor of the first with a room on it that no
 * stair reaches from the ground. Each is reported at the top-level object it is in, naming the path
 * inside a prefab.
 */
export function checkBuildingSpace(
  file: string,
  space: SpaceJson,
  prefabs: Readonly<Record<string, unknown>>,
): Diagnostic[] {
  const buildings = buildingsIn(space, prefabs);
  const [first] = buildings;
  const found: Diagnostic[] = [];
  const at = (code: DiagnosticCode, path: string, field: string, why: string) => {
    const i = space.objects.findIndex((object) => object.id === path.split('/')[0]);
    const nested = path.includes('/');
    const message = nested ? `${why} (${path.split('/').join(' › ')})` : why;
    found.push({ code, severity: severityOf(code), message, file, path: `/objects/${i}${nested ? '' : field}` });
  };
  const field = `/components/${BUILDING}`;
  for (const building of buildings.slice(1))
    at('E094', building.path, field, `A space has one building: “${first?.path}” is its first`);
  const tilemap = tilemapsIn(space, prefabs)[0];
  if (first && tilemap)
    at('E094', first.path, field, `A space has a building or a ${TILEMAP}, not both: “${tilemap.path}” is its tilemap`);
  if (!first) return found;
  const reached = floorsReached(first.fields);
  const lost = [...new Set(first.fields.rooms.map((room) => room.floor))]
    .filter((floor) => floor < first.fields.floors && !reached.has(floor))
    .sort((a, b) => a - b);
  for (const floor of lost)
    at(
      'W158',
      first.path,
      `${field}/stairs`,
      `No stair reaches floor ${floor} from the ground: its rooms can’t be walked to`,
    );
  return found;
}

/** Format 19's building for a space's first one, or undefined when it has none or has a tilemap. */
export function packBuildingOf(space: SpaceJson, prefabs: Readonly<Record<string, unknown>>): PackBuilding | undefined {
  const building = buildingsIn(space, prefabs)[0];
  if (!building || tilemapsIn(space, prefabs).length > 0) return undefined;
  const { fields } = building;
  const shape = { at: building.at, slot: fields.slot, slots: fields.slots, floors: fields.floors };
  const places: Record<string, readonly [number, number]> = {};
  eachFlat(space, prefabs, (path, _seen, place) => {
    const on = floorPlaceOf(shape, place.at);
    if (on && path !== building.path) places[path] = on;
  });
  const rooms = [...fields.rooms].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    object: building.path,
    at: building.at,
    slot: fields.slot,
    slots: fields.slots,
    floors: fields.floors,
    climb: fields.climb ?? fields.slot[1],
    rooms: Object.fromEntries(rooms.map((room) => [room.id, [room.floor, room.slot, room.span ?? 1] as const])),
    stairs: fields.stairs.map((stair) => [stair.floor, stair.x] as const),
    places: Object.fromEntries(
      Object.keys(places)
        .sort()
        .map((path) => [path, places[path] as readonly [number, number]]),
    ),
  };
}

/** Format 19's buildings: each 2D space's first building, by space. */
export function packBuildings(
  spaces: ReadonlyMap<string, SpaceJson>,
  prefabs: ReadonlyMap<string, SpaceJson>,
): Record<string, PackBuilding> {
  const all = Object.fromEntries(prefabs);
  const buildings: Record<string, PackBuilding> = {};
  for (const [id, space] of spaces) {
    const packed = is2d(space) ? packBuildingOf(space, all) : undefined;
    if (packed) buildings[id] = packed;
  }
  return buildings;
}
