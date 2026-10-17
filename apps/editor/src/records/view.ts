/**
 * The rows a table shows (M2.5): those a search and the filters leave, in a column's order.
 */
import { compareText } from '@eb/schema';
import { sortKey } from './cells.ts';
import { type Filter, matchesFilter } from './filters.ts';
import { type Column, fieldValue, fold, type Row } from './table.ts';

export interface Sort {
  readonly column: string;
  readonly descending: boolean;
}

export interface View {
  readonly search: string;
  readonly filters: readonly Filter[];
  readonly sort: Sort;
}

// The person's own language's order, digits as numbers: "g2" before "g10".
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function keyOf(column: Column, row: Row): number | string | undefined {
  switch (column.kind) {
    case 'record':
      return row.name ?? row.record.id;
    case 'problems':
      return row.record.problems.length;
    case 'used-by':
      return row.users;
    case 'field':
      return sortKey(column.def, fieldValue(row.record, column.name), row.texts.get(column.key) ?? '');
  }
}

/** Numbers before text, each in its own order. */
function compareKeys(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return collator.compare(a, b);
}

/**
 * The rows in the column's order. A value the record leaves out sorts last either way, and rows
 * that tie keep the order of their ids, so the order never depends on how they came.
 */
export function sortRows(rows: readonly Row[], column: Column, descending: boolean): Row[] {
  const keyed = rows.map((row) => ({ row, key: keyOf(column, row) }));
  keyed.sort((a, b) => {
    const tie = compareText(a.row.record.id, b.row.record.id);
    if (a.key === undefined || b.key === undefined) return a.key === b.key ? tie : a.key === undefined ? 1 : -1;
    const order = compareKeys(a.key, b.key);
    return (descending ? -order : order) || tie;
  });
  return keyed.map(({ row }) => row);
}

/** The rows the view leaves, in its order: every word searched for, every filter that can test. */
export function viewRows(rows: readonly Row[], columns: readonly Column[], view: View): Row[] {
  const words = fold(view.search).split(/\s+/).filter(Boolean);
  const kept = rows.filter(
    (row) =>
      words.every((word) => row.haystack.includes(word)) &&
      view.filters.every((filter) => matchesFilter(row, columns, filter) !== false),
  );
  const column = columns.find((c) => c.key === view.sort.column) ?? columns[0];
  return column ? sortRows(kept, column, view.sort.descending) : kept;
}
