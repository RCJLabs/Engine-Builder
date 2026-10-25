/**
 * Bake navigation (M6.2, D74, docs/specs/navigation.md#the-editor): the open space's still solids and
 * terrain, as the compiler lists them (navSolids), baked in the bake worker, and written to
 * spaces/<id>.nav with the hash of what was read, as one step of undo. And whether the navmesh there
 * is stale: its hash against the space's as it stands now, as W147 says.
 */
import {
  modelFieldOf,
  type NavModelOf,
  navFileBytes,
  navHeader,
  navInputsHash,
  navModelsOf,
  navPath,
  navSolids,
} from '@eb/compiler';
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import type { LiveSpace } from '../spaces/live.ts';
import { written } from '../terrain/terrainEdits.ts';
import { groundOf } from '../walk/world.ts';
import { bakeInWorker } from './bakeClient.ts';
import { baking, navDrawn } from './navState.ts';

/** A placed record's model collider, through the project's records and types. */
export function modelsOf(project: OpenProject): NavModelOf {
  return navModelsOf({
    record: (key) => {
      const record = project.index?.records.get(key);
      return record?.unreadable === undefined ? record?.value : undefined;
    },
    field: (type) => {
      const file = project.catalog.types.get(type)?.file;
      return file ? modelFieldOf(file) : null;
    },
  });
}

/** The inputs' hash of the space as it stands, as a bake would read it. */
export const hashOf = (project: OpenProject, live: LiveSpace & { space: NonNullable<LiveSpace['space']> }) =>
  navInputsHash(live.space, live.prefabs, modelsOf(project), live.terrain?.heights ?? undefined);

/** Whether the open space has a navmesh, and whether it was baked from what is there now. */
export function navStatus(project: OpenProject, live: LiveSpace | null): { has: boolean; stale: boolean } {
  if (!live?.space || !live.nav) return { has: false, stale: false };
  const header = navHeader(live.nav);
  return { has: true, stale: header === null || header.hash !== hashOf(project, { ...live, space: live.space }) };
}

const tiles = (n: number) => `${n} tile${n === 1 ? '' : 's'}`;
const polygons = (n: number) => `${n} polygon${n === 1 ? '' : 's'}`;

/** Bakes the open space and writes its navmesh. What happened is said in `baking`. */
export async function bakeHere(project: OpenProject, live: LiveSpace | null): Promise<void> {
  const space = live?.space;
  if (!live || !space || live.open.kind !== 'space') return;
  const { path, id } = live.open;
  baking.value = { path, words: 'Baking…', busy: true };
  try {
    const models = modelsOf(project);
    const heights = live.terrain?.heights ?? undefined;
    const hash = navInputsHash(space, live.prefabs, models, heights);
    const ground = space.terrain && heights ? groundOf(space, heights) : null;
    const baked = await bakeInWorker(navSolids(space, live.prefabs, models), ground);
    const bytes = navFileBytes(hash, baked.navmesh);
    await editing.edit('Bake navigation', (copy) => written(copy, navPath(id), bytes));
    navDrawn.value = { path, look: baked.look };
    const words = `Baked in ${baked.ms} ms: ${tiles(baked.look.tiles)}, ${polygons(baked.look.polygons)}.`;
    baking.value = { path, words, busy: false };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    baking.value = { path, words: `Couldn’t bake: ${why}`, busy: false };
  }
}
