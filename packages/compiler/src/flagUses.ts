/**
 * Flags used outside the records (M5.8): a space's trigger zones set and read them in play, and
 * screens read them, so the flags' lint (W108 to W110) counts both as a record's uses.
 */
import { type Condition, conditionRefs, type FactCatalog, FLAG } from '@eb/core';
import type { FlagUses } from '@eb/schema';

/** Where the screens' reads are listed: the lint's messages name it, as they name a record. */
export const SCREENS = 'ui/';

/** A collector for the flags each of the screens' conditions reads, and what it has found. */
export function screenReads(facts: FactCatalog): {
  readonly read: (condition: Condition) => void;
  readonly found: Map<string, Set<string>>;
} {
  const found = new Map<string, Set<string>>();
  const read = (condition: Condition) => {
    for (const ref of conditionRefs(condition, facts)) {
      if (ref.type === FLAG) found.set(ref.id, (found.get(ref.id) ?? new Set()).add(SCREENS));
    }
  };
  return { read, found };
}

/** The zones' uses with the screens' reads beside them. */
export function withScreens(zones: FlagUses, screens: ReadonlyMap<string, ReadonlySet<string>>): FlagUses {
  const read = new Map<string, Set<string>>();
  for (const from of [zones.read, screens]) {
    for (const [flag, where] of from) read.set(flag, new Set([...(read.get(flag) ?? []), ...where]));
  }
  // The spaces' spawn points, walkers, objects and tags (M5.9, M6.2, M6.6, M6.7) go along: the editor's records
  // check against them, and a quest's target offers the objects.
  return {
    set: zones.set,
    read,
    ...(zones.held ? { held: zones.held } : {}),
    ...(zones.spawns ? { spawns: zones.spawns } : {}),
    ...(zones.walkers ? { walkers: zones.walkers } : {}),
    ...(zones.objects ? { objects: zones.objects } : {}),
    ...(zones.tags ? { tags: zones.tags } : {}),
  };
}
