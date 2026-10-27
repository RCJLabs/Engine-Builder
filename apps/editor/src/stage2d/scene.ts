/**
 * What a 2D space draws (M7.1, D83, docs/specs/2d-scenes.md#a-2d-space), as plain values: every
 * object, through its prefabs and their overrides, at its place in whole art pixels, in the order
 * it is drawn (depth, the nearer last; equal depths in the file's order). A placement moves what it
 * places by its `at` and scales it by its `scale`; nothing turns in 2D. A sprite comes from the
 * object's sprite component, or a placed actor's sprite; a box or a sphere is drawn as a flat shape;
 * a tilemap (M7.2) is drawn in place of its object's box, its tile the tileset's, and so is a building
 * (M7.3), each room's sprite its room record's.
 */
import {
  type BuildingFields,
  eachFlat,
  type Fields,
  flatPlacesOf,
  isBuilding,
  isFields,
  isTilemap,
  type Point,
  recordHere,
  type SpaceJson,
  type SpaceObject,
  type TilemapFields,
} from '@eb/compiler';
import type { BuildingLook } from './building2d.ts';

export type { Point };

export type Look =
  | {
      readonly kind: 'sprite';
      readonly sprite: string;
      readonly clip?: string;
      readonly flip: boolean;
      readonly phase: number;
    }
  | { readonly kind: 'box' | 'sphere'; readonly colour: string }
  | { readonly kind: 'tilemap'; readonly map: TilemapFields; readonly tile: Point }
  | BuildingLook;

export interface Item {
  /** The ids that lead to it: "gate/bell" inside a prefab. */
  readonly path: string;
  readonly at: Point;
  readonly depth: number;
  readonly scale: Point;
  readonly look: Look;
  readonly parallax?: { readonly factor: Point; readonly repeat: boolean };
  /** The actor it places (M6.2's walkers): walked by the stage when the sim sends it. */
  readonly actor?: string;
}

/** A shape's colour when it names none: the palette's stone. */
export const SHAPE_COLOUR = '#5e6072';
const ACTOR = 'actor:';

/** A tileset's tile size, or 16 by 16 while it can't be read. */
function tileOf(tileset: unknown): Point {
  const tile = isFields(tileset) ? tileset.tile : undefined;
  return Array.isArray(tile) && tile.length === 2 && tile.every((n) => Number.isInteger(n) && n >= 1)
    ? [tile[0], tile[1]]
    : [16, 16];
}

/** Each room record a building names, by id, and the sprite it draws with. */
function roomSprites(building: BuildingFields, record: (key: string) => unknown): Record<string, string> {
  const sprites: Record<string, string> = {};
  for (const { room } of building.rooms) {
    const value = record(`room:${room}`);
    if (isFields(value) && typeof value.sprite === 'string') sprites[room] = value.sprite;
  }
  return sprites;
}

function lookOf(object: SpaceObject, actor: Fields | undefined, record: (key: string) => unknown): Look | undefined {
  const map = object.components?.tilemap;
  if (isTilemap(map)) return { kind: 'tilemap', map, tile: tileOf(record(`tileset:${map.tileset}`)) };
  const building = object.components?.building;
  if (isBuilding(building)) return { kind: 'building', building, sprites: roomSprites(building, record) };
  const sprite = object.components?.sprite;
  if (isFields(sprite) && typeof sprite.sprite === 'string')
    return {
      kind: 'sprite',
      sprite: sprite.sprite,
      ...(typeof sprite.clip === 'string' ? { clip: sprite.clip } : {}),
      flip: sprite.flip === true,
      phase: typeof sprite.phase === 'number' ? sprite.phase : 0,
    };
  if (actor && typeof actor.sprite === 'string') return { kind: 'sprite', sprite: actor.sprite, flip: false, phase: 0 };
  if (object.shape === 'box' || object.shape === 'sphere')
    return { kind: object.shape, colour: object.color ?? SHAPE_COLOUR };
  return undefined;
}

function parallaxOf(object: SpaceObject): Item['parallax'] {
  const layer = object.components?.parallax;
  if (!isFields(layer) || !Array.isArray(layer.factor)) return undefined;
  const [fx, fy] = layer.factor as number[];
  return { factor: [fx ?? 1, fy ?? 1], repeat: layer.repeat === true };
}

/** Every object the space draws, in draw order, leaving out what `taken` names and all it places. */
export function sceneOf(
  space: SpaceJson,
  prefabs: Readonly<Record<string, unknown>>,
  record: (key: string) => unknown,
  taken: ReadonlySet<string> = new Set(),
): Item[] {
  const found: (Item & { order: number })[] = [];
  const gone = (path: string) => [...taken].some((t) => path === t || path.startsWith(`${t}/`));
  eachFlat(space, prefabs, (path, seen, place, passed) => {
    if (gone(path)) return;
    const actor = seen.record?.startsWith(ACTOR) ? recordHere(record(seen.record), passed) : undefined;
    const look = lookOf(seen, actor, record);
    const parallax = parallaxOf(seen);
    if (look)
      found.push({
        path,
        ...place,
        look,
        ...(parallax ? { parallax } : {}),
        ...(actor ? { actor: (seen.record as string).slice(ACTOR.length) } : {}),
        order: found.length,
      });
  });
  return found.sort((a, b) => a.depth - b.depth || a.order - b.order).map(({ order: _, ...item }) => item);
}

/** Where each object stands, by path, for a walker's goal: placed objects drawn or not. */
export const placesOf = flatPlacesOf;
