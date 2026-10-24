/**
 * A project's own component kinds (M5.2, D64), components/<kind>.json, as the type designer
 * changes them: each change one step, with every component of the kind in spaces/ and prefabs/
 * rewritten to match, as a type's change rewrites its records (D33). An object's own component is
 * whole; an override's is only what it changes, so a required field added fills the first and
 * never the second, which would then override what the prefab says.
 */
import { classifySpaceFile, componentPath, isFields, PREFABS_DIR, type ProjectSource, SPACES_DIR } from '@eb/compiler';
import type { FileChange } from '../editing/history.ts';
import { editJson } from '../editing/jsonText.ts';
import type { TypeChange } from '../types/typeEdits.ts';
import { changeSpaceText, readSpace, type SpaceJson, type SpaceObject } from './spaceFile.ts';

type Components = Record<string, unknown>;
/** What becomes of an object's `components`, whole for its own, a part for an override's: undefined takes it out. */
export type ComponentsChange = (components: Components, whole: boolean) => Components | undefined;

/** `node` with its overrides, or without the key when none are left. */
function withOverrides(node: Record<string, unknown>, overrides: unknown): Record<string, unknown> {
  const { overrides: _, ...rest } = node;
  return isFields(overrides) && Object.keys(overrides).length === 0 ? rest : { ...node, overrides };
}

/** Every `components` in a space, its objects' own and each override's inside a prefab placed, changed by `change`. */
export function mapComponents(
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  change: ComponentsChange,
): SpaceJson {
  const withComponents = (node: Record<string, unknown>, whole: boolean) => {
    if (!isFields(node.components)) return node;
    const next = change({ ...node.components }, whole);
    const { components: _, ...rest } = node;
    return next === undefined || Object.keys(next).length === 0 ? rest : { ...node, components: next };
  };
  const overrides = (prefabId: string | undefined, map: unknown, depth: number): unknown => {
    const prefab = prefabId === undefined ? undefined : prefabs.get(prefabId);
    if (!prefab || !isFields(map) || depth > 8) return map;
    const next: Record<string, unknown> = {};
    for (const [id, node] of Object.entries(map)) {
      const inner = prefab.objects.find((o) => o.id === id);
      if (!inner || !isFields(node)) {
        next[id] = node;
        continue;
      }
      let changed = withComponents(node, false);
      if (inner.prefab !== undefined && changed.overrides !== undefined) {
        changed = withOverrides(changed, overrides(inner.prefab, changed.overrides, depth + 1));
      }
      // An override left with nothing in it means nothing: it goes, as Revert takes one out.
      if (Object.keys(changed).length > 0) next[id] = changed;
    }
    return next;
  };
  const objects = space.objects.map((object) => {
    let next = withComponents(object as unknown as Record<string, unknown>, true);
    if (object.prefab !== undefined && next.overrides !== undefined) {
      next = withOverrides(next, overrides(object.prefab, next.overrides, 0));
    }
    return next as unknown as SpaceObject;
  });
  return { ...space, objects };
}

/** A part of a component rewritten as its whole would be, without the keys a rewrite only adds: a field filled in. */
function partOf(rewrite: (value: unknown) => unknown, part: unknown): unknown {
  const after = rewrite(part);
  if (!isFields(part) || !isFields(after)) return after;
  const before = Object.keys(part);
  const gone = before.some((key) => !(key in after));
  if (gone) return after;
  return Object.fromEntries(Object.entries(after).filter(([key]) => before.includes(key)));
}

/** A kind's change as one to each `components`: its fields rewritten, renamed or taken away. */
export const rewriteKind =
  (kind: string, rewrite: (value: unknown) => unknown): ComponentsChange =>
  (components, whole) =>
    kind in components
      ? { ...components, [kind]: whole ? rewrite(components[kind]) : partOf(rewrite, components[kind]) }
      : components;

export const renameKindIn =
  (from: string, to: string): ComponentsChange =>
  (components) =>
    from in components
      ? Object.fromEntries(Object.entries(components).map(([key, value]) => [key === from ? to : key, value]))
      : components;

export const removeKindIn =
  (kind: string): ComponentsChange =>
  (components) => {
    const { [kind]: _, ...rest } = components;
    return rest;
  };

/** Every value of `kind`'s components, objects' own (whole) and overrides' (parts). */
export function componentValues(
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  kind: string,
): { value: unknown; whole: boolean }[] {
  const found: { value: unknown; whole: boolean }[] = [];
  mapComponents(space, prefabs, (components, whole) => {
    if (kind in components) found.push({ value: components[kind], whole });
    return components;
  });
  return found;
}

/** Every value of `kind`'s components in the project's spaces and prefabs. */
export async function valuesOfKind(source: ProjectSource, kind: string): Promise<{ value: unknown; whole: boolean }[]> {
  const { files, prefabs } = await readAll(source);
  return [...files.values()].flatMap((text) => {
    const read = readSpace(text);
    return read.ok ? componentValues(read.space, prefabs, kind) : [];
  });
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const encode = (text: string) => new TextEncoder().encode(text);

/** Every space and prefab file's text, and the prefabs by id. */
async function readAll(source: ProjectSource) {
  const files = new Map<string, string>();
  const prefabs = new Map<string, SpaceJson>();
  for (const path of [...(await source.files(SPACES_DIR)), ...(await source.files(PREFABS_DIR))]) {
    const role = classifySpaceFile(path);
    const bytes = role.kind === 'space' || role.kind === 'prefab' ? await source.read(path) : undefined;
    if (!bytes) continue;
    const text = decode(bytes);
    files.set(path, text);
    const read = readSpace(text);
    if (role.kind === 'prefab' && read.ok) prefabs.set(role.id, read.space);
  }
  return { files, prefabs };
}

/** Each space and prefab after `change`, as file changes in their own layouts. */
export async function changeAllComponents(source: ProjectSource, change: ComponentsChange): Promise<FileChange[]> {
  const { files, prefabs } = await readAll(source);
  const changes: FileChange[] = [];
  for (const [path, text] of files) {
    const after = changeSpaceText(text, (space) => mapComponents(space, prefabs, change));
    if (after !== null && after !== text) changes.push({ path, before: encode(text), after: encode(after) });
  }
  return changes;
}

/** The kind's file changed by `change`, and its components rewritten to match; refused, before anything is written, when they hold what it would lose. */
export async function changeKind(
  source: ProjectSource,
  kind: string,
  change: (file: unknown) => TypeChange,
): Promise<FileChange[]> {
  const path = componentPath(kind);
  const bytes = await source.read(path);
  if (!bytes) return [];
  let json: unknown;
  try {
    json = JSON.parse(decode(bytes));
  } catch {
    return [];
  }
  const made = change(json);
  const after = editJson(bytes, () => made.file);
  const own: FileChange[] = after === bytes ? [] : [{ path, before: bytes, after }];
  if (!made.rewrite && !made.check) return own;
  // Parts too: a field renamed onto one an override sets would lose it.
  if (made.check) made.check((await valuesOfKind(source, kind)).map((found) => found.value));
  return made.rewrite ? [...own, ...(await changeAllComponents(source, rewriteKind(kind, made.rewrite)))] : own;
}

/** A new kind's file, unless there is one. */
export async function createKindFile(source: ProjectSource, kind: string, title: string): Promise<FileChange[]> {
  const path = componentPath(kind);
  if (await source.read(path)) throw new Error(`${path} exists already`);
  return [{ path, before: null, after: encode(`${JSON.stringify({ title, fields: {} }, null, 2)}\n`) }];
}

/** The kind `from` named `to`: its file moves, and every component of it in spaces and prefabs follows. */
export async function renameKind(source: ProjectSource, from: string, to: string): Promise<FileChange[]> {
  const before = await source.read(componentPath(from));
  if (!before) return [];
  if (await source.read(componentPath(to))) throw new Error(`There is a component kind ${to} already`);
  return [
    { path: componentPath(from), before, after: null },
    { path: componentPath(to), before: null, after: before },
    ...(await changeAllComponents(source, renameKindIn(from, to))),
  ];
}

/** The kind's file gone, and every component of it: undo brings both back. */
export async function deleteKind(source: ProjectSource, kind: string): Promise<FileChange[]> {
  const before = await source.read(componentPath(kind));
  if (!before) return [];
  return [
    { path: componentPath(kind), before, after: null },
    ...(await changeAllComponents(source, removeKindIn(kind))),
  ];
}
