/**
 * Renames reaching spaces and prefabs (M5.2, D64; D33): a record renamed, at every reference the
 * space checks found to it (a placement, a component's field, an override's); a type renamed, in
 * every "type:id" of it there; and a type's field changed, in every placed record's overrides of
 * that type, inside prefabs too. An override is a part, so a field filled in fills nothing there.
 */

import { classifySpaceFile, type Fields, isFields, PREFABS_DIR, type ProjectSource, SPACES_DIR } from '@eb/compiler';
import { formatRef, parseRef, pointerKeys } from '@eb/core';
import type { FileChange } from '../editing/history.ts';
import { renameAtPointers } from '../types/rewrites.ts';
import { partOf } from './kindEdits.ts';
import { changeSpaceText, readSpace, type SpaceJson, type SpaceObject } from './spaceFile.ts';

type OverridesChange = (overrides: Fields) => Fields | undefined;

const ofType = (ref: string | undefined, type: string) => ref !== undefined && parseRef(ref)?.type === type;

/** Each placed record of `type`'s overrides in a space, its own and those a prefab placement makes, changed by `change`. */
export function mapPlacedRecords(
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  type: string,
  change: OverridesChange,
): SpaceJson {
  const changed = (node: Record<string, unknown>) => {
    if (!isFields(node.overrides)) return node;
    const next = change(node.overrides);
    const { overrides: _, ...rest } = node;
    return next === undefined || Object.keys(next).length === 0 ? rest : { ...node, overrides: next };
  };
  const inside = (prefabId: string | undefined, map: unknown, depth: number): unknown => {
    const prefab = prefabId === undefined ? undefined : prefabs.get(prefabId);
    if (!prefab || !isFields(map) || depth > 8) return map;
    return Object.fromEntries(
      Object.entries(map).map(([id, node]) => {
        const object = prefab.objects.find((o) => o.id === id);
        if (!object || !isFields(node)) return [id, node];
        if (ofType(object.record, type)) return [id, changed(node)];
        if (object.prefab !== undefined && node.overrides !== undefined) {
          return [id, { ...node, overrides: inside(object.prefab, node.overrides, depth + 1) }];
        }
        return [id, node];
      }),
    );
  };
  const objects = space.objects.map((object) => {
    const node = object as unknown as Record<string, unknown>;
    if (ofType(object.record, type)) return changed(node) as unknown as SpaceObject;
    if (object.prefab !== undefined && object.overrides !== undefined) {
      return { ...object, overrides: inside(object.prefab, object.overrides, 0) } as SpaceObject;
    }
    return object;
  });
  return { ...space, objects };
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const encode = (text: string) => new TextEncoder().encode(text);

async function spaceFiles(source: ProjectSource): Promise<Map<string, Uint8Array>> {
  const found = new Map<string, Uint8Array>();
  for (const path of [...(await source.files(SPACES_DIR)), ...(await source.files(PREFABS_DIR))]) {
    const role = classifySpaceFile(path);
    if (role.kind !== 'space' && role.kind !== 'prefab') continue;
    const bytes = await source.read(path);
    if (bytes) found.set(path, bytes);
  }
  return found;
}

/** Every space and prefab after `change`, each in its own layout, with the prefabs as they are now. */
async function changeEach(
  source: ProjectSource,
  change: (space: SpaceJson, prefabs: ReadonlyMap<string, SpaceJson>, path: string) => SpaceJson,
): Promise<FileChange[]> {
  const files = await spaceFiles(source);
  const prefabs = new Map<string, SpaceJson>();
  for (const [path, bytes] of files) {
    const role = classifySpaceFile(path);
    const read = readSpace(decode(bytes));
    if (role.kind === 'prefab' && read.ok) prefabs.set(role.id, read.space);
  }
  const changes: FileChange[] = [];
  for (const [path, before] of files) {
    const text = decode(before);
    const after = changeSpaceText(text, (space) => change(space, prefabs, path));
    if (after !== null && after !== text) changes.push({ path, before, after: encode(after) });
  }
  return changes;
}

/** Every placed record of `type`'s overrides rewritten as its records are: a field renamed or taken out, never filled. */
export const rewritePlacedRecords = (source: ProjectSource, type: string, rewrite: (value: unknown) => unknown) =>
  changeEach(source, (space, prefabs) =>
    mapPlacedRecords(space, prefabs, type, (overrides) => partOf(rewrite, overrides) as Fields),
  );

/** Every placed record of `type`'s overrides, for a change to check before it loses data. */
export async function placedOverrides(source: ProjectSource, type: string): Promise<unknown[]> {
  const found: unknown[] = [];
  await changeEach(source, (space, prefabs) =>
    mapPlacedRecords(space, prefabs, type, (overrides) => {
      found.push(overrides);
      return overrides;
    }),
  );
  return found;
}

/** The record `type:from` named `to` at each pointer that names it, by file. */
export const renameRecordInSpaces = (
  source: ProjectSource,
  pointers: ReadonlyMap<string, readonly string[]>,
  type: string,
  from: string,
  to: string,
) =>
  changeEach(source, (space, _prefabs, path) => {
    const at = pointers.get(path);
    return at ? (renameAtPointers(at, type, from, to)(space) as SpaceJson) : space;
  });

/** The type `from` named `to` in every "from:id" at each pointer that names one, by file. */
export const renameTypeInSpaces = (
  source: ProjectSource,
  pointers: ReadonlyMap<string, readonly string[]>,
  from: string,
  to: string,
) =>
  changeEach(source, (space, _prefabs, path) => {
    const at = pointers.get(path);
    if (!at) return space;
    return at.reduce((value, pointer) => swapAt(value, pointerKeys(pointer), from, to), space as unknown) as SpaceJson;
  });

function swapAt(node: unknown, keys: readonly string[], from: string, to: string): unknown {
  const [key, ...rest] = keys;
  if (key === undefined) {
    const ref = typeof node === 'string' ? parseRef(node) : null;
    return ref?.type === from ? formatRef(to, ref.id) : node;
  }
  if (Array.isArray(node)) {
    const i = Number(key);
    return node.map((item, at) => (at === i ? swapAt(item, rest, from, to) : item));
  }
  return isFields(node) && Object.hasOwn(node, key) ? { ...node, [key]: swapAt(node[key], rest, from, to) } : node;
}
