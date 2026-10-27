/**
 * What a 2D space draws (M7.1, D83, docs/specs/2d-scenes.md#a-2d-space), as plain values: every
 * object, through its prefabs and their overrides, at its place in whole art pixels, in the order
 * it is drawn (depth, the nearer last; equal depths in the file's order). A placement moves what it
 * places by its `at` and scales it by its `scale`; nothing turns in 2D. A sprite comes from the
 * object's sprite component, or a placed actor's sprite; a box or a sphere is drawn as a flat shape.
 */
import {
  type Fields,
  isFields,
  overridden,
  passedOn,
  placedObjects,
  recordHere,
  type SpaceJson,
  type SpaceObject,
} from '@eb/compiler';

export type Point = readonly [number, number];

export type Look =
  | {
      readonly kind: 'sprite';
      readonly sprite: string;
      readonly clip?: string;
      readonly flip: boolean;
      readonly phase: number;
    }
  | { readonly kind: 'box' | 'sphere'; readonly colour: string };

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
const DEEPEST = 8;
const ACTOR = 'actor:';

interface Place {
  readonly at: Point;
  readonly depth: number;
  readonly scale: Point;
}

const placeIn = (parent: Place, object: SpaceObject): Place => {
  const [x, y, d] = object.at ?? [0, 0, 0];
  const [sx, sy] = object.scale ?? [1, 1, 1];
  return {
    at: [parent.at[0] + x * parent.scale[0], parent.at[1] + y * parent.scale[1]],
    depth: parent.depth + d,
    scale: [parent.scale[0] * sx, parent.scale[1] * sy],
  };
};

function lookOf(object: SpaceObject, actor: Fields | undefined): Look | undefined {
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

/** Every object the space draws, in draw order, leaving out what `taken` names. */
export function sceneOf(
  space: SpaceJson,
  prefabs: Readonly<Record<string, unknown>>,
  record: (key: string) => unknown,
  taken: ReadonlySet<string> = new Set(),
): Item[] {
  const found: (Item & { order: number })[] = [];
  const walk = (object: SpaceObject, layers: readonly unknown[], ids: string[], parent: Place, depth: number) => {
    const path = ids.join('/');
    if (taken.has(path)) return;
    const seen = overridden(object, layers);
    const passed = passedOn(object, layers);
    const place = placeIn(parent, seen);
    const actor = seen.record?.startsWith(ACTOR) ? recordHere(record(seen.record), passed) : undefined;
    const look = lookOf(seen, actor);
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
    const prefab = seen.prefab === undefined ? undefined : prefabs[seen.prefab];
    if (!isFields(prefab) || depth >= DEEPEST) return;
    for (const inner of placedObjects(prefab as unknown as SpaceJson, passed))
      walk(inner.object, inner.layers, [...ids, inner.object.id], place, depth + 1);
  };
  for (const object of space.objects) walk(object, [], [object.id], { at: [0, 0], depth: 0, scale: [1, 1] }, 0);
  return found.sort((a, b) => a.depth - b.depth || a.order - b.order).map(({ order: _, ...item }) => item);
}

/** Where each object stands, by path, for a walker's goal: placed objects drawn or not. */
export function placesOf(space: SpaceJson, prefabs: Readonly<Record<string, unknown>>): Map<string, Point> {
  const places = new Map<string, Point>();
  const walk = (object: SpaceObject, layers: readonly unknown[], ids: string[], parent: Place, depth: number) => {
    const seen = overridden(object, layers);
    const place = placeIn(parent, seen);
    places.set(ids.join('/'), place.at);
    const prefab = seen.prefab === undefined ? undefined : prefabs[seen.prefab];
    if (!isFields(prefab) || depth >= DEEPEST) return;
    for (const inner of placedObjects(prefab as unknown as SpaceJson, passedOn(object, layers)))
      walk(inner.object, inner.layers, [...ids, inner.object.id], place, depth + 1);
  };
  for (const object of space.objects) walk(object, [], [object.id], { at: [0, 0], depth: 0, scale: [1, 1] }, 0);
  return places;
}
