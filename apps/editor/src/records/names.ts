/**
 * Records' names, for a type whose file names the field that holds them (`nameField`, M2.5).
 * Lists, pickers and "used by" show a record's name beside its id; one without a name, or of a
 * type that names none, is known by its id alone.
 */
import type { TypeFile } from '@eb/schema';
import type { Catalog } from '../forms/catalog.ts';
import { slugify } from '../forms/labels.ts';
import type { NameOf } from './cells.ts';
import type { RecordIndex } from './recordIndex.ts';

/** The name `value` holds for its type, or undefined. Blank names don't count. */
export function nameIn(file: TypeFile | undefined, value: unknown): string | undefined {
  const field = file?.nameField;
  if (field === undefined || typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const name = Object.hasOwn(value, field) ? (value as Record<string, unknown>)[field] : undefined;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : undefined;
}

/** Each record's name by "type:id", from the index; undefined until the index is read. */
export function namesOf(index: RecordIndex | null, catalog: Catalog): NameOf {
  return (key) => {
    const record = index?.records.get(key);
    return record ? nameIn(catalog.types.get(record.type)?.file, record.value) : undefined;
  };
}

/** What to type for a copy of `base` (a name, or an id): the first "base 2", "base 3"… whose id is free. */
export function copyName(base: string, ids: readonly string[]): string {
  for (let n = 2; ; n++) {
    const typed = `${base} ${n}`;
    if (!ids.includes(slugify(typed))) return typed;
  }
}
