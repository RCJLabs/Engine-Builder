/**
 * Containers (M6.8, D80, docs/specs/barter.md#containers): an interact that `holds` items, by its
 * space and object. The pack carries each use's `holds` as format 16; the inventory kit is built with
 * them, as the quests kit is with the places, and keeps a container's items once they change.
 */
import { isRecordId } from '../records.ts';
import type { Uses } from './types.ts';

/** What each container starts with, by `space/object`: item ids to counts, `{}` for an empty one. */
export type Containers = Readonly<Record<string, Readonly<Record<string, number>>>>;

export const NO_CONTAINERS: Containers = {};

/** A container's key: its space, then its object's path. */
export const containerKey = (space: string, object: string): string => `${space}/${object}`;

/** Whether any use holds items: a world without one keeps format 15 or lower. */
export const holdsAny = (uses: Uses | undefined): boolean =>
  uses !== undefined &&
  Object.values(uses).some((found) => Object.values(found).some((use) => use.holds !== undefined));

/** Every use that holds items, by its key. */
export function containersOf(uses: Uses | undefined): Containers {
  const out: Record<string, Readonly<Record<string, number>>> = {};
  for (const space of Object.keys(uses ?? {}).sort()) {
    const found = (uses as Uses)[space] ?? {};
    for (const object of Object.keys(found).sort()) {
      const holds = found[object]?.holds;
      if (holds !== undefined) out[containerKey(space, object)] = holds;
    }
  }
  return out;
}

/** What is wrong with a format 16 use's `holds`, or nothing: item ids to whole counts of 1 or more. */
export function holdsProblem(key: string, holds: unknown): string | undefined {
  if (typeof holds !== 'object' || holds === null || Array.isArray(holds))
    return `The use "${key}"'s holds is not an object`;
  for (const [item, count] of Object.entries(holds)) {
    if (!isRecordId(item)) return `The use "${key}" holds "${item}", which is not an item's id`;
    if (!Number.isSafeInteger(count) || (count as number) < 1) {
      return `The use "${key}" holds ${String(count)} of "${item}": a whole number, 1 or more`;
    }
  }
  return undefined;
}
