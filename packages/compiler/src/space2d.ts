/**
 * What a space's view draws (M7.1, D83, docs/specs/2d-scenes.md#a-2d-space): E058 for what a 2D
 * space has no use for (terrain, an environment, a cylinder or a plane, a scale that isn't whole, a
 * turn, water, a placed model) and for what only a 2D space draws (a fit, a size, a backdrop, a
 * sprite, a parallax layer). Each object is held to its space's view as placed, through prefabs and
 * overrides: a prefab has no view of its own, so what one places is its space's to answer for.
 */
import { type Diagnostic, MODEL, severityOf } from '@eb/schema';
import { eachPlaced, isFields } from './overrides.ts';
import type { SpaceKind } from './spaceFiles.ts';
import type { SpaceJson, SpaceObject } from './spaceShape.ts';

/** The art pixels a 2D space wants in view when it doesn't say. */
export const FIT_DEFAULT: readonly [number, number] = [320, 180];

export const is2d = (space: Pick<SpaceJson, 'view'>): boolean => space.view === '2d';

/** Whether a file's value, read but perhaps not sound, is a 2D space's. */
export const is2dValue = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && (value as { view?: unknown }).view === '2d';

const ONLY_2D = ['fit', 'size', 'backdrop'] as const;
const FLAT_SHAPES = new Set(['box', 'sphere']);

/** What one object, as placed, can't be in a space of this view: a field and why, each. */
function objectProblems(object: SpaceObject, flat: boolean): [string, string][] {
  const found: [string, string][] = [];
  const components = object.components ?? {};
  if (!flat) {
    for (const kind of ['sprite', 'parallax'])
      if (isFields(components[kind])) found.push([`components/${kind}`, `Only a 2D space draws a ${kind}`]);
    return found;
  }
  if (object.shape !== undefined && !FLAT_SHAPES.has(object.shape))
    found.push(['shape', `A 2D space draws a box or a sphere, not a ${object.shape}`]);
  if (object.scale?.some((n) => !Number.isInteger(n)))
    found.push(['scale', 'A 2D space scales by whole numbers: anything else blurs a pixel']);
  if (object.turn?.some((n) => n !== 0))
    found.push(['turn', 'A 2D space doesn’t turn its objects: flip a sprite to face it the other way']);
  if (isFields(components.water)) found.push(['components/water', 'A 2D space has no water: draw it with sprites']);
  if (object.record?.startsWith(`${MODEL}:`))
    found.push(['record', 'A 2D space draws sprites: a model is a 3D space’s']);
  return found;
}

/** E058 for one sound space or prefab file against its view. */
export function checkView(
  file: string,
  kind: SpaceKind,
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
): Diagnostic[] {
  const at = (path: string, message: string): Diagnostic => ({
    code: 'E058',
    severity: severityOf('E058'),
    message,
    file,
    path,
  });
  if (kind === 'prefab') {
    const own = (['view', ...ONLY_2D] as const).filter((key) => space[key] !== undefined);
    return own.map((key) => at(`/${key}`, `Only a space has a ${key}: a prefab is drawn as its space is`));
  }
  const flat = is2d(space);
  const found: Diagnostic[] = [];
  if (!flat)
    for (const key of ONLY_2D)
      if (space[key] !== undefined) found.push(at(`/${key}`, `Only a 2D space has a ${key}: give it the view "2d"`));
  if (flat && space.terrain !== undefined)
    found.push(at('/terrain', 'A 2D space has no terrain: draw its ground with sprites'));
  if (flat && space.environment !== undefined)
    found.push(at('/environment', 'A 2D space has no environment: its backdrop is its sky'));
  space.objects.forEach((object, i) => {
    eachPlaced(object, prefabs, (seen, ids) => {
      for (const [field, why] of objectProblems(seen, flat)) {
        if (ids.length === 1) found.push(at(`/objects/${i}/${field}`, why));
        else found.push(at(`/objects/${i}`, `${why} (${ids.join(' › ')})`));
      }
    });
  });
  return found;
}

/** E091's sentence for a sprite component's clip its sprite doesn't have, given the sprite's value; null when it has it. */
export function clipProblem(clip: unknown, sprite: unknown): string | null {
  if (typeof clip !== 'string' || typeof sprite !== 'object' || sprite === null) return null;
  const clips = (sprite as { clips?: unknown }).clips;
  if (typeof clips !== 'object' || clips === null || Object.hasOwn(clips, clip)) return null;
  const has = Object.keys(clips).map((n) => `“${n}”`);
  return `Its sprite has no clip “${clip}”: it has ${has.join(', ') || 'none'}`;
}
