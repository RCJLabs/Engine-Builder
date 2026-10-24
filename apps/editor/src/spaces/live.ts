/**
 * The open space or prefab as it is now (M5.1): read again after every change to the project,
 * with every prefab beside it, so placements draw what they place. The view, the outliner and
 * the object form all read this one copy.
 */
import { classifySpaceFile, PREFABS_DIR, type ProjectSource } from '@eb/compiler';
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
  return read.ok ? { open, space: read.space, prefabs } : { open, space: null, problem: read.problem, prefabs };
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
