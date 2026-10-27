/**
 * A building drawn and walked in a 2D space (M7.3, D85, docs/specs/rooms.md#the-stage), as plain values:
 * each room's sprite from the room's bottom-left, repeated across it and cut at its right edge; then each
 * stair's sprite, its origin on the stair's x, repeated up from its floor's foot to the next and cut at
 * the top. And a walker's way through it: the core's route as the points it walks to, from its own
 * floor's foot, so one sent elsewhere halfway up a ladder climbs back down it first.
 */
import type { BuildingFields } from '@eb/compiler';
import { buildingRoute, type FloorPlace, floorPlaceOf, type PackBuilding, pointOf } from '@eb/core';
import type { SpriteRecord } from '@eb/schema';
import type { Point } from './camera.ts';
import { originOf, type Rect } from './place.ts';

/** A building as the scene draws it: its fields, and each room record's sprite by the room's id. */
export interface BuildingLook {
  readonly kind: 'building';
  readonly building: BuildingFields;
  readonly sprites: Readonly<Record<string, string>>;
}

/** One sprite a building draws: its world box, which shows the frame's left `w` columns and bottom `h` rows. */
export interface BuildingPiece {
  readonly sprite: string;
  /** The room's id, or the stair's place in the list. */
  readonly of: string;
  readonly box: Rect;
}

/** Every piece a building draws standing at `at`, rooms in the file's order and then the stairs. */
export function buildingPieces(
  look: BuildingLook,
  at: Point,
  spriteOf: (id: string) => SpriteRecord | undefined,
): BuildingPiece[] {
  const { building } = look;
  const [sw, sh] = building.slot;
  const pieces: BuildingPiece[] = [];
  for (const room of building.rooms) {
    const sprite = look.sprites[room.room];
    const record = sprite === undefined ? undefined : spriteOf(sprite);
    if (sprite === undefined || !record) continue;
    const [fw, fh] = record.frame;
    const [left, foot, width] = [at[0] + room.slot * sw, at[1] + room.floor * sh, (room.span ?? 1) * sw];
    for (let x = 0; x < width; x += fw)
      pieces.push({ sprite, of: room.id, box: { x: left + x, y: foot, w: Math.min(fw, width - x), h: fh } });
  }
  const stair = building.stair === undefined ? undefined : spriteOf(building.stair);
  if (building.stair === undefined || !stair) return pieces;
  const [ox] = originOf(stair);
  const [fw, fh] = stair.frame;
  building.stairs.forEach(({ floor, x }, i) => {
    const foot = at[1] + floor * sh;
    for (let y = 0; y < sh; y += fh)
      pieces.push({
        sprite: building.stair as string,
        of: `stair ${i}`,
        box: { x: at[0] + x - ox, y: foot + y, w: fw, h: Math.min(fh, sh - y) },
      });
  });
  return pieces;
}

/**
 * The way a walker at `from` takes to a mark of the building: the points it walks to, its own floor's
 * foot first, and its route as floors and x. Undefined when either end is off the building, so it walks
 * straight; null when no stair reaches the mark's floor, so it stays.
 */
export function buildingWay(
  building: PackBuilding,
  from: Point,
  goal: string,
  target: Point,
): { readonly path: Point[]; readonly route: FloorPlace[] } | null | undefined {
  const start = floorPlaceOf(building, from);
  const end = building.places[goal] ?? floorPlaceOf(building, target);
  if (!start || !end) return undefined;
  const route = buildingRoute(building, start, end);
  return route ? { path: route.map((place) => pointOf(building, place)), route } : null;
}
