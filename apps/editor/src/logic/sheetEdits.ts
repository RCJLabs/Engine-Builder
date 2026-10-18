/**
 * The changes the sheet editor makes (M3.1), as plain functions of JSON: a new row, rows and
 * effects moved or taken out, an event's argument set or cleared. Each returns a copy, never
 * changing what it was given, and keeps keys in the order a file would have them.
 */
import type { Effect } from '@eb/core';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The first of row-1, row-2… that no row of the sheet has. */
export function newRowId(rows: unknown): string {
  const taken = new Set((Array.isArray(rows) ? rows : []).map((row) => (isObject(row) ? row.id : undefined)));
  for (let n = 1; ; n++) if (!taken.has(`row-${n}`)) return `row-${n}`;
}

/** A row that runs when a flag changes and does nothing yet: sound as it stands, to be filled in. */
export const newRow = (rows: unknown) => ({ id: newRowId(rows), when: { event: 'flag/changed' }, do: [] });

/** The list with the item at `from` moved to `to`; the list as it was when either is outside it. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** The list without the item at `index`. */
export const without = <T>(list: readonly T[], index: number): T[] => list.filter((_, i) => i !== index);

/**
 * A row's When with argument `name` set to `value`, or cleared when it is undefined. A When with
 * no arguments left loses its `args`, as a file written by hand would leave it out.
 */
export function withArg(when: unknown, name: string, value: string | number | boolean | undefined) {
  const base = isObject(when) ? when : {};
  const args = { ...(isObject(base.args) ? base.args : {}) };
  if (value === undefined) delete args[name];
  else args[name] = value;
  const { args: _, ...rest } = base;
  return Object.keys(args).length === 0 ? rest : { ...rest, args };
}

/** A When for another event: its arguments go, as they were the old event's. */
export const forEvent = (event: string) => ({ event });

/** The effects the editor offers to add (D36: the engine's own), each as it starts, to be filled in. */
export const NEW_EFFECTS = {
  'set-flag': { label: 'Set a flag', effect: { effect: 'set-flag', flag: '', to: true } },
  'add-to-flag': { label: 'Add to a flag', effect: { effect: 'add-to-flag', flag: '', by: 1 } },
  roll: {
    label: 'Roll',
    effect: {
      effect: 'roll',
      outcomes: [
        { chance: 50, effects: [] },
        { chance: 50, effects: [] },
      ],
    },
  },
  other: { label: 'Another effect, as JSON', effect: { effect: '' } },
} as const satisfies Record<string, { label: string; effect: Effect }>;

export type NewEffect = keyof typeof NEW_EFFECTS;

/** A fresh copy of a new effect, so no two share their lists. */
export const newEffect = (kind: NewEffect): Effect => JSON.parse(JSON.stringify(NEW_EFFECTS[kind].effect));
