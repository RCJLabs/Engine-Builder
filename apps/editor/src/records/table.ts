/**
 * The Records panel's table as plain functions of the index (M2.5): a type's columns, and a row
 * per record with what each cell shows. view.ts orders and narrows them.
 */
import { formatRef } from '@eb/core';
import type { FieldDef, TypeFile } from '@eb/schema';
import type { Catalog } from '../forms/catalog.ts';
import { labelOf } from '../forms/labels.ts';
import { cellText, type NameOf, refKey } from './cells.ts';
import { nameIn } from './names.ts';
import { type IndexedRecord, type RecordIndex, usersOf } from './recordIndex.ts';

export type Column =
  /** The record: its name when its type has one, and its id. */
  | { readonly key: 'record'; readonly kind: 'record'; readonly label: string }
  | {
      readonly key: string;
      readonly kind: 'field';
      readonly label: string;
      readonly name: string;
      readonly def: FieldDef;
    }
  | { readonly key: 'problems'; readonly kind: 'problems'; readonly label: string }
  | { readonly key: 'used-by'; readonly kind: 'used-by'; readonly label: string };

export const fieldColumn = (name: string) => `field:${name}`;

/**
 * The record, then each field the type lists, then its problems and what uses it. The field that
 * names records has no column of its own: the record's column shows it.
 */
export function columnsOf(file: TypeFile | undefined): Column[] {
  const fields = Object.entries(file?.fields ?? {}).filter(([name]) => name !== file?.nameField);
  return [
    { key: 'record', kind: 'record', label: file?.nameField ? 'Name' : 'Id' },
    ...fields.map(([name, def]) => ({
      key: fieldColumn(name),
      kind: 'field' as const,
      label: labelOf(name, def),
      name,
      def,
    })),
    { key: 'problems', kind: 'problems', label: 'Problems' },
    { key: 'used-by', kind: 'used-by', label: 'Used by' },
  ];
}

export interface Row {
  readonly record: IndexedRecord;
  readonly name: string | undefined;
  /** Each field column's text, by column key. */
  readonly texts: ReadonlyMap<string, string>;
  /** How many records refer to it. */
  readonly users: number;
  /** Everything a search looks in, folded. */
  readonly haystack: string;
}

/** Text as a search compares it: lowercase, accents dropped. */
export const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The value a record holds for a field, or undefined when it holds none (or isn't an object). */
export const fieldValue = (record: IndexedRecord, name: string): unknown =>
  typeof record.value === 'object' && record.value !== null && !Array.isArray(record.value)
    ? (record.value as Record<string, unknown>)[name]
    : undefined;

/** A row for each of `type`'s records, in id order. */
export function rowsOf(index: RecordIndex, catalog: Catalog, type: string, nameOf: NameOf): Row[] {
  const file = catalog.types.get(type)?.file;
  const columns = columnsOf(file);
  const rows: Row[] = [];
  for (const id of catalog.records.get(type) ?? []) {
    const record = index.records.get(formatRef(type, id));
    if (!record) continue;
    const texts = new Map<string, string>();
    const words = [id];
    for (const column of columns) {
      if (column.kind !== 'field') continue;
      const value = fieldValue(record, column.name);
      const text = cellText(column.def, value, nameOf);
      texts.set(column.key, text);
      words.push(text);
      // A ref is found by the id it holds as well as by the name it shows.
      if (column.def.kind === 'ref' && refKey(column.def, value) !== null) words.push(value as string);
    }
    const name = nameIn(file, record.value);
    if (name) words.push(name);
    rows.push({ record, name, texts, users: usersOf(index, record.key).length, haystack: fold(words.join('\n')) });
  }
  return rows;
}
