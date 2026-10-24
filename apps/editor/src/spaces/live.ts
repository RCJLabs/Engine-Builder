/**
 * The open space or prefab as it is now (M5.1): read again after every change to the project,
 * with every prefab beside it, so placements draw what they place. The view, the outliner and
 * the object form all read this one copy.
 */
import { classifySpaceFile, PREFABS_DIR, type ProjectSource, parseJsonFile, terrainPath } from '@eb/compiler';
import { ENVIRONMENT, ENVIRONMENT_DATA, type EnvironmentRecord, schemaIssues } from '@eb/schema';
import { effect, signal } from '@preact/signals';
import { editing } from '../editing/current.ts';
import { current, revision } from '../projects/opened.ts';
import { readSpace, type SpaceJson } from './spaceFile.ts';
import { type OpenSpace, openSpace, picked } from './state.ts';

export interface LiveSpace {
  readonly open: OpenSpace;
  /** Null when the file is gone or isn't a space; `problem` says why. */
  readonly space: SpaceJson | null;
  readonly problem?: string;
  /** Every prefab whose file is sound, by id. */
  readonly prefabs: ReadonlyMap<string, SpaceJson>;
  /** A space's terrain files (M5.3) as they are, null for one that is missing, when it has a terrain. */
  readonly terrain?: { readonly heights: Uint8Array | null; readonly paint: Uint8Array | null };
  /**
   * A space's environment (M5.4) when it names one: its record, or null when there is none of that
   * id, or it isn't of its type, so the view keeps the editor's own light.
   */
  readonly environment?: { readonly id: string; readonly record: EnvironmentRecord | null };
}

export const live = signal<LiveSpace | null>(null);

/** The live copy of `open`, or null while it is still being read. */
export const liveOf = (open: OpenSpace | null): LiveSpace | null =>
  open && live.value?.open.path === open.path ? live.value : null;

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

async function readLive(source: ProjectSource, open: OpenSpace): Promise<LiveSpace> {
  const files = (await source.files(PREFABS_DIR)).filter((file) => classifySpaceFile(file).kind === 'prefab');
  const [bytes, ...prefabBytes] = await Promise.all([open.path, ...files].map((file) => source.read(file)));
  const prefabs = new Map<string, SpaceJson>();
  files.forEach((file, i) => {
    const read = prefabBytes[i] ? readSpace(decode(prefabBytes[i])) : null;
    const role = classifySpaceFile(file);
    if (read?.ok && role.kind === 'prefab') prefabs.set(role.id, read.space);
  });
  if (!bytes) return { open, space: null, problem: `There is no ${open.path} any more.`, prefabs };
  const read = readSpace(decode(bytes));
  if (!read.ok) return { open, space: null, problem: read.problem, prefabs };
  if (open.kind !== 'space') return { open, space: read.space, prefabs };
  const id = read.space.environment;
  const environment = id === undefined ? {} : { environment: { id, record: await environmentOf(source, id) } };
  if (!read.space.terrain) return { open, space: read.space, prefabs, ...environment };
  const [heights, paint] = await Promise.all(
    (['heights', 'paint'] as const).map((part) => source.read(terrainPath(open.id, part))),
  );
  const terrain = { heights: heights ?? null, paint: paint ?? null };
  return { open, space: read.space, prefabs, terrain, ...environment };
}

async function environmentOf(source: ProjectSource, id: string): Promise<EnvironmentRecord | null> {
  const bytes = await source.read(`records/${ENVIRONMENT}/${id}.json`);
  const parsed = bytes ? parseJsonFile(bytes) : null;
  if (!parsed?.ok) return null;
  const sound = schemaIssues(ENVIRONMENT_DATA.recordType.schema, parsed.value).length === 0;
  return sound ? (parsed.value as EnvironmentRecord) : null;
}

let asked = 0;
effect(() => {
  const open = openSpace.value;
  const project = current.value;
  void revision.value;
  void editing.access.value.kind;
  const ticket = ++asked;
  if (live.peek()?.open.path !== open?.path) live.value = null;
  if (!open || !project) return;
  void readLive(project.source, open).then((read) => {
    if (ticket !== asked) return;
    live.value = read;
    // Objects an undo or another tab took away are chosen no more.
    const ids = new Set(read.space?.objects.map((o) => o.id) ?? []);
    const kept = picked.peek().filter((id) => ids.has(id));
    if (kept.length !== picked.peek().length) picked.value = kept;
  });
});
