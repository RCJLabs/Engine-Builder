/**
 * What is wrong with a type file, in the compiler's words (E015, E016; type-files.md), each at
 * the deepest place the type designer shows: the file's own keys, each def, each def's options.
 */
import { pointerSegment } from '@eb/core';
import { type Diagnostic, joinKitType, kitClash, readTypeFile, type TypeFile, typeRefs } from '@eb/schema';
import { routeProblems } from '../forms/problems.ts';
import { eachDef } from './defPaths.ts';

const OPTIONS: Record<string, readonly string[]> = {
  text: ['min', 'max', 'multiline'],
  int: ['min', 'max'],
  number: ['min', 'max'],
  enum: ['values'],
  ref: ['to'],
  list: ['min', 'max'],
  asset: ['of'],
};

/** A kit's type: the kit, the type's name and the kit's type file. */
export interface KitTypeOf {
  readonly id: string;
  readonly type: string;
  readonly file: TypeFile;
}

const issue = (code: 'E015' | 'E016' | 'E037', file: string, path: string, message: string): Diagnostic => ({
  code,
  severity: 'error',
  message,
  file,
  path,
});

/**
 * The type file's problems: its shape and rules (E015), then, once those are sound, refs to types
 * the project has no type file for (E016), as the compiler checks them. `types` are the names of
 * the project's type files, sound or not. For a kit's type (M3.3, D41), `kit` is the kit and its
 * type file, which the file is joined to first, as the compiler joins them: a field of the kit's
 * name is E037.
 */
export function typeProblems(json: unknown, types: readonly string[], file: string, kit?: KitTypeOf): Diagnostic[] {
  const joined = kit ? joinKitType(kit.file, json) : { joined: json, clashes: [] };
  const clashes = joined.clashes.map((name) => {
    const { path, message } = kitClash(kit?.id ?? '', kit?.type ?? '', name);
    return issue('E037', file, path, message);
  });
  const read = readTypeFile(joined.joined);
  if (!read.ok) return [...clashes, ...read.issues.map(({ path, message }) => issue('E015', file, path, message))];
  return typeRefs(read.file)
    .filter((ref) => !types.includes(ref.type))
    .map((ref) =>
      issue(
        'E016',
        file,
        ref.path,
        `No record type "${ref.type}": add types/${ref.type}.json, or name a type the project has`,
      ),
    )
    .concat(clashes);
}

/** Every pointer the designer shows a place for, in the type file. */
export function shownPointers(json: unknown): Set<string> {
  const shown = new Set(['', '/title', '/description', '/nameField', '/fields']);
  eachDef(json, (def, kind, path) => {
    const at = path.map((key) => `/${pointerSegment(key)}`).join('');
    shown.add(at);
    for (const key of ['kind', 'label', 'description', 'optional', ...(OPTIONS[kind] ?? [])]) shown.add(`${at}/${key}`);
    if (kind === 'group') shown.add(`${at}/fields`);
    for (const key of ['values', 'to']) {
      const list = def[key];
      if (Array.isArray(list)) for (const i of list.keys()) shown.add(`${at}/${key}/${i}`);
    }
  });
  return shown;
}

/** The problems by the pointer that shows them. */
export const routedProblems = (
  json: unknown,
  types: readonly string[],
  file: string,
  kit?: KitTypeOf,
): Map<string, Diagnostic[]> => routeProblems(typeProblems(json, types, file, kit), shownPointers(json));
