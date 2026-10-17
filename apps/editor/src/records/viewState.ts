/**
 * What the Records panel shows (M2.5): the type whose table is up, and each type's search,
 * filters and sort, kept while the project is open and forgotten when it closes. The Project
 * panel's list of types picks the type too, so this sits outside the panel's own code.
 */
import { signal } from '@preact/signals';
import type { View } from './view.ts';

/** A table as it first shows: every record, by name (or id). */
export const DEFAULT_VIEW: View = { search: '', filters: [], sort: { column: 'record', descending: false } };

/** The type the Records panel shows; null for the project's first. */
export const tableType = signal<string | null>(null);

export const views = signal<ReadonlyMap<string, View>>(new Map());

export const viewOf = (type: string): View => views.value.get(type) ?? DEFAULT_VIEW;

export function setView(type: string, change: (view: View) => View): void {
  const next = new Map(views.value);
  next.set(type, change(viewOf(type)));
  views.value = next;
}

/** A project opening or closing starts every table afresh. */
export function forgetTables(): void {
  tableType.value = null;
  views.value = new Map();
}
