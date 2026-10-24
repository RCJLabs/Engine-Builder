/**
 * Where a project's spaces and prefabs sit and what each file under spaces/ and prefabs/ is (M5.1,
 * D63): apart from spaces.ts, which checks them, so the editor names and places them as a project
 * opens. The spec is docs/specs/viewport.md.
 */
import { isRecordId } from '@eb/core';

/** One place in a 3D world, an exterior or an interior. */
export const SPACES_DIR = 'spaces';
/** A group of objects that spaces and other prefabs place by reference. */
export const PREFABS_DIR = 'prefabs';

export type SpaceKind = 'space' | 'prefab';

export const spacePath = (kind: SpaceKind, id: string) => `${kind === 'space' ? SPACES_DIR : PREFABS_DIR}/${id}.json`;

export type SpaceFile =
  | { readonly kind: SpaceKind; readonly id: string }
  | { readonly kind: 'misplaced'; readonly reason: string }
  | { readonly kind: 'ignored' };

/** A project's own component kinds, each a type file (M5.2, D64): components/<kind>.json. */
export const COMPONENTS_DIR = 'components';

export const componentPath = (kind: string) => `${COMPONENTS_DIR}/${kind}.json`;

export type ComponentFile =
  | { readonly kind: 'component'; readonly id: string }
  | { readonly kind: 'misplaced'; readonly reason: string }
  | { readonly kind: 'ignored' };

/** What a file under components/ is: a kind's type file, named by the kind's id, as types/ names a type. */
export function classifyComponentFile(path: string): ComponentFile {
  const parts = path.split('/');
  const name = parts[parts.length - 1] ?? '';
  if (parts[0] !== COMPONENTS_DIR || !name.endsWith('.json')) return { kind: 'ignored' };
  if (parts.length !== 2) return { kind: 'misplaced', reason: 'A component kind sits at components/<kind>.json' };
  const id = name.slice(0, -'.json'.length);
  if (!isRecordId(id)) {
    return { kind: 'misplaced', reason: `"${id}" isn’t a kind's id: use lowercase words joined by hyphens` };
  }
  return { kind: 'component', id };
}

/** What a file under spaces/ or prefabs/ is: its name is its id, as a record's is. */
export function classifySpaceFile(path: string): SpaceFile {
  const parts = path.split('/');
  const top = parts[0];
  const name = parts[parts.length - 1] ?? '';
  if ((top !== SPACES_DIR && top !== PREFABS_DIR) || !name.endsWith('.json')) return { kind: 'ignored' };
  const kind: SpaceKind = top === SPACES_DIR ? 'space' : 'prefab';
  if (parts.length !== 2) {
    return { kind: 'misplaced', reason: `A ${kind} sits at ${top}/<id>.json, not in a folder of its own` };
  }
  const id = name.slice(0, -'.json'.length);
  if (!isRecordId(id)) {
    return { kind: 'misplaced', reason: `"${id}" isn’t an id: name a ${kind} in lowercase words joined by hyphens` };
  }
  return { kind, id };
}
