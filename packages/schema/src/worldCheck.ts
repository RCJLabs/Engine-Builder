/**
 * E076 (M5.9, D71, docs/specs/worldspaces.md#enter-space): an enter-space effect names a space the
 * project has, and a spawn point that space has. Records and components alike: the compiler tells
 * both checks the spaces once it has read them.
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
