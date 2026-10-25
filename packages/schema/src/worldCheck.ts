/**
 * E076 (M5.9, D71, docs/specs/worldspaces.md#enter-space): an enter-space effect names a space the
 * project has, and a spawn point that space has. E079 (M6.2, D74, docs/specs/navigation.md): a
 * walk-to names an actor placed in a space, an object of that space, and the space has a navmesh.
 * Records and components alike: the compiler tells both checks the spaces once it has read them.
 */
import type { Effect } from '@eb/core';
import type { DiagnosticCode } from './diagnostics.ts';

/** Each space's spawn points by object path, through its prefabs: every space is a key. */
export type SpaceSpawns = ReadonlyMap<string, ReadonlySet<string>>;

type Report = (code: DiagnosticCode, path: string, message: string) => void;

/** An effect whose schema passed, at `path`: E076 when it is an enter-space naming what isn't there. */
export function checkEnterSpace(effect: Effect, spaces: SpaceSpawns, report: Report, path: string): void {
  if (effect.effect !== 'enter-space' || typeof effect.space !== 'string') return;
  const spawns = spaces.get(effect.space);
  if (!spawns) {
    report('E076', `${path}/space`, `No space "${effect.space}": spaces/${effect.space}.json isn't there`);
    return;
  }
  if (typeof effect.spawn === 'string' && !spawns.has(effect.spawn)) {
    const has = spawns.size > 0 ? `: it has ${[...spawns].sort().join(', ')}` : ': it has none';
    report('E076', `${path}/spawn`, `The space "${effect.space}" has no spawn point "${effect.spawn}"${has}`);
  }
}

/** Where a placed actor stands (M6.2): its space, every object path there, and whether the space has a navmesh. */
export interface Walker {
  readonly space: string;
  readonly objects: ReadonlySet<string>;
  readonly navmesh: boolean;
}

/** Each placed actor's walker, by its id. */
export type Walkers = ReadonlyMap<string, Walker>;

/** An effect whose schema passed, at `path`: E079 when it is a walk-to the spaces can't walk. */
export function checkWalkTo(effect: Effect, walkers: Walkers, report: Report, path: string): void {
  if (effect.effect !== 'walk-to' || typeof effect.actor !== 'string' || typeof effect.to !== 'string') return;
  const walker = walkers.get(effect.actor);
  if (!walker) {
    report('E079', `${path}/actor`, `The actor "${effect.actor}" stands in no space: place it in one to walk it`);
    return;
  }
  if (!walker.objects.has(effect.to)) {
    report(
      'E079',
      `${path}/to`,
      `The space "${walker.space}", where "${effect.actor}" stands, has no object "${effect.to}"`,
    );
    return;
  }
  if (!walker.navmesh) {
    report('E079', path, `The space "${walker.space}" has no navmesh: open it and press Bake navigation`);
  }
}
