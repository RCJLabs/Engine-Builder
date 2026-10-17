/**
 * The problems a form shows beside its fields: the same diagnostics the compiler gives
 * (validateRecords), for the one record on screen, each at the field it is about.
 */
import { pointerSegment } from '@eb/core';
import { type Diagnostic, type RecordInput, type TypeFile, type ValueDef, validateRecords } from '@eb/schema';
import type { Catalog } from './catalog.ts';

/**
 * One record's diagnostics. Every other record counts as there, for references to name, but only
 * this one is checked, so a keystroke costs one record's checks, not the project's.
 */
export function checkRecord(catalog: Catalog, type: string, id: string, value: unknown): Diagnostic[] {
  const records: RecordInput[] = [{ type, id, value }];
  for (const [other, ids] of catalog.records) {
    for (const each of ids)
      if (other !== type || each !== id) records.push({ type: other, id: each, value: undefined, unreadable: true });
  }
  const assets = new Set(catalog.assets);
  return validateRecords(catalog.recordTypes, records, { assets }).diagnostics.filter(
    (d) => d.type === type && d.id === id,
  );
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The JSON Pointer of every field a form shows for `value`: every field the type lists, set or
 * not, each list item and map entry there is, and '' for the record itself.
 */
export function fieldPointers(file: TypeFile, value: unknown): Set<string> {
  const found = new Set<string>();
  const visit = (def: ValueDef, at: unknown, pointer: string) => {
    found.add(pointer);
    if (def.kind === 'group') {
      for (const [name, field] of Object.entries(def.fields)) {
        visit(field, isObject(at) ? at[name] : undefined, `${pointer}/${pointerSegment(name)}`);
      }
    } else if (def.kind === 'list' && Array.isArray(at)) {
      for (const [i, item] of at.entries()) visit(def.of, item, `${pointer}/${i}`);
    } else if (def.kind === 'map' && isObject(at)) {
      for (const [key, item] of Object.entries(at)) visit(def.of, item, `${pointer}/${pointerSegment(key)}`);
    }
  };
  visit({ kind: 'group', fields: file.fields }, value, '');
  return found;
}

/**
 * Each diagnostic at the deepest field shown that holds its path: a field, a list item, or the
 * record itself (''), which takes what no field claims, such as an unknown key. A condition's
 * problems inside its tree go to the condition's field.
 */
export function routeProblems(
  diagnostics: readonly Diagnostic[],
  shown: ReadonlySet<string>,
): Map<string, Diagnostic[]> {
  const routed = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    let at = diagnostic.path;
    while (at !== '' && !shown.has(at)) at = at.slice(0, at.lastIndexOf('/'));
    const list = routed.get(at) ?? [];
    list.push(diagnostic);
    routed.set(at, list);
  }
  return routed;
}
