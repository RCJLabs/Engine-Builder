/**
 * Format 14's maps (M6.6, D78, docs/specs/markers.md#the-map): each space's map, baked in the editor,
 * as the Map screen draws it. The image travels with the world's other files, base64 by its path.
 */

/** A space's map: where it lies and the image of it. */
export interface PackMap {
  /** The ground it covers in metres: [least x, least z, most x, most z]. */
  readonly bounds: readonly [number, number, number, number];
  /** The image's width and height in pixels. */
  readonly size: readonly [number, number];
  /** The image's path in the project, a key of the world's files. */
  readonly image: string;
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const numbers = (value: unknown, length: number): value is readonly number[] =>
  Array.isArray(value) && value.length === length && value.every((n) => typeof n === 'number' && Number.isFinite(n));

/** What is wrong with one map, or nothing. */
function mapProblem(space: string, map: unknown, files: Readonly<Record<string, unknown>>): string | undefined {
  if (!isObject(map) || Object.keys(map).some((key) => key !== 'bounds' && key !== 'size' && key !== 'image')) {
    return `The map of "${space}" is not its bounds, size and image`;
  }
  const { bounds, size, image } = map;
  if (
    !numbers(bounds, 4) ||
    !((bounds[0] as number) < (bounds[2] as number) && (bounds[1] as number) < (bounds[3] as number))
  ) {
    return `The map of "${space}" has no ground: its bounds are not [least x, least z, most x, most z]`;
  }
  if (!numbers(size, 2) || !size.every((n) => Number.isInteger(n) && n > 0)) {
    return `The map of "${space}" has no size in pixels`;
  }
  if (typeof image !== 'string' || !Object.hasOwn(files, image))
    return `The map of "${space}" has no image in the pack`;
  return undefined;
}

/** Format 14's maps, each of a space the pack has, with its image among the world's files. */
export function mapsProblem(world: Readonly<Record<string, unknown>>): string | undefined {
  const { spaces, files, maps } = world;
  if (!isObject(spaces) || !isObject(files) || !isObject(maps) || Object.keys(maps).length === 0) {
    return 'A format 14 pack has no maps';
  }
  for (const [space, map] of Object.entries(maps)) {
    if (!Object.hasOwn(spaces, space)) return `A map of a space the pack lacks: "${space}"`;
    const problem = mapProblem(space, map, files);
    if (problem !== undefined) return problem;
  }
  return undefined;
}
