/**
 * Bands on a whole number, listed lowest first: a faction's standing (docs/specs/factions.md),
 * a rank ladder's stat and a bond (docs/specs/roster.md). A value is in the last band whose start
 * it has reached, the first holding everything below the second: Space-Wrecked's levels and
 * Landnam's bands are both "the last band passed". The factions and roster kits share it.
 */

export interface Banded {
  readonly id: string;
  /** Where it begins. The first band's can be left out. */
  readonly from?: number;
}

export interface Bounds {
  /** No bound that way when left out. */
  readonly min?: number;
  readonly max?: number;
}

/** `n` kept within the bounds. */
export const withinBounds = (bounds: Bounds, n: number): number =>
  Math.min(Math.max(n, bounds.min ?? Number.NEGATIVE_INFINITY), bounds.max ?? Number.POSITIVE_INFINITY);

/** The band a value is in: the last whose start it has reached, the first holding everything below. */
export function bandAt<B extends Banded>(bands: readonly B[] | undefined, value: number): B | undefined {
  const list = bands ?? [];
  let found = list[0];
  for (const band of list.slice(1)) if (band.from !== undefined && band.from <= value) found = band;
  return found;
}

/** Where a band is in the list. `owner` names whose bands they are when it is missing, which throws. */
export function bandIndex(bands: readonly Banded[] | undefined, owner: string, band: unknown): number {
  const index = (bands ?? []).findIndex((b) => b.id === band);
  if (index === -1) throw new Error(`${owner} has no band "${String(band)}"`);
  return index;
}

/** Whether a value is at or past where the band begins. A band that isn't in the list throws. */
export function reachedBand(
  bands: readonly Banded[] | undefined,
  owner: string,
  band: unknown,
  value: number,
): boolean {
  const list = bands ?? [];
  const index = bandIndex(list, owner, band);
  const from = (list[index] as Banded).from;
  return index === 0 || (from !== undefined && value >= from);
}
