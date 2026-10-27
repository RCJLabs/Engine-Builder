/**
 * One place for each actor (M6.1, D73, docs/specs/npcs.md#an-npc): an NPC's stats, bag and talk are
 * its actor's, keyed by its id, so the actor stands in one place across the project's spaces. Each
 * place after the first is E077, at the space's object that puts it there, counted through prefabs.
 */
import { type Diagnostic, severityOf, type Walkers } from '@eb/schema';
import { eachPlaced } from './overrides.ts';
import type { SpaceJson } from './spaceShape.ts';
import type { SpaceFileRead } from './spaces.ts';
import { is2dValue } from './spaceView.ts';

/** The record type an NPC is placed as. */
const ACTOR = 'actor';
const DEEPEST = 8;

interface Place {
  readonly file: string;
  /** The space's id. */
  readonly space: string;
  /** The space's object that puts the actor there, by JSON Pointer. */
  readonly pointer: string;
  /** The path of ids to the actor, through prefabs. */
  readonly path: string;
}

/** Each actor's places, in the spaces' order and each space's objects' order. */
export function actorPlaces(
  files: readonly SpaceFileRead[],
  prefabs: ReadonlyMap<string, SpaceJson>,
): Map<string, Place[]> {
  const places = new Map<string, Place[]>();
  for (const read of files) {
    if (read.kind !== 'space' || read.value === undefined) continue;
    for (const [i, top] of (read.value as SpaceJson).objects.entries()) {
      eachPlaced(
        top,
        prefabs,
        (seen, ids) => {
          const record = seen.record;
          if (typeof record !== 'string' || !record.startsWith(`${ACTOR}:`)) return;
          const actor = record.slice(ACTOR.length + 1);
          const pointer = ids.length === 1 ? `/objects/${i}/record` : `/objects/${i}`;
          const list = places.get(actor) ?? [];
          list.push({ file: read.file, space: read.id, pointer, path: ids.join('/') });
          places.set(actor, list);
        },
        DEEPEST,
      );
    }
  }
  return places;
}

export function checkActorPlaces(
  files: readonly SpaceFileRead[],
  prefabs: ReadonlyMap<string, SpaceJson>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [actor, [first, ...more]] of actorPlaces(files, prefabs)) {
    if (!first) continue;
    for (const place of more) {
      diagnostics.push({
        code: 'E077',
        severity: severityOf('E077'),
        message: `The actor "${actor}" stands in one place only: it is already at "${first.path}" in ${first.file}`,
        file: place.file,
        path: place.pointer,
      });
    }
  }
  return diagnostics;
}

/**
 * Where each placed actor stands, for walk-to (E079, M6.2): its first place's space, every object
 * path in that space through its prefabs, and whether the space has a navmesh (`navmeshes`, by id).
 * A 2D space's walkers walk in straight lines and need none (M7.1, D83): it counts as having one.
 */
export function walkersOf(
  files: readonly SpaceFileRead[],
  prefabs: ReadonlyMap<string, SpaceJson>,
  navmeshes: ReadonlySet<string>,
): Walkers {
  const objects = spaceObjectsOf(files, prefabs);
  const flat = new Set(files.filter((f) => f.kind === 'space' && is2dValue(f.value)).map((f) => f.id));
  const walkers = new Map<string, { space: string; objects: ReadonlySet<string>; navmesh: boolean }>();
  for (const [actor, [first]] of actorPlaces(files, prefabs)) {
    if (!first) continue;
    walkers.set(actor, {
      space: first.space,
      objects: objects.get(first.space) ?? new Set(),
      navmesh: navmeshes.has(first.space) || flat.has(first.space),
    });
  }
  return walkers;
}

/** Each space's object paths, through prefabs: what walk-to (E079) and an objective's target (E086, M6.6) can name. */
export function spaceObjectsOf(
  files: readonly SpaceFileRead[],
  prefabs: ReadonlyMap<string, SpaceJson>,
): Map<string, ReadonlySet<string>> {
  const objects = new Map<string, ReadonlySet<string>>();
  for (const read of files) {
    if (read.kind !== 'space' || read.value === undefined) continue;
    const paths = new Set<string>();
    for (const top of (read.value as SpaceJson).objects)
      eachPlaced(top, prefabs, (_, ids) => paths.add(ids.join('/')), DEEPEST);
    objects.set(read.id, paths);
  }
  return objects;
}
