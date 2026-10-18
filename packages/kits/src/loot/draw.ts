/**
 * Drawing from a loot table (docs/specs/kits.md): picks over weighted entries, a weight for
 * nothing, tables inside tables, and conditions that take an entry out, as Minecraft's and
 * Diablo II's tables have them. roll-loot gives what it draws; a shop puts it on its shelf. Both
 * draw the same way, from streams the caller names, and a preview reads the same entries.
 */
import type { Condition, RecordStore, Rng } from '@eb/core';
import { LOOT_TABLE, type LootEntry, type LootTableRecord, rangeOf } from '../inventory/types.ts';

/** Tables nest at most this deep when rolled; validation stops a loop long before (E036). */
export const MAX_DEPTH = 16;

export interface Drawn {
  readonly entry: LootEntry;
  /** The count it drew: of the item or resource, or of rolls of the table. */
  readonly count: number;
}

/** The table's record, or a thrown error: validation stops a reference to a missing table. */
export function lootTable(content: RecordStore, id: unknown): LootTableRecord {
  if (typeof id !== 'string' || !content.has(LOOT_TABLE, id)) throw new Error(`No loot table "${String(id)}"`);
  return content.get(LOOT_TABLE, id) as LootTableRecord;
}

/** The entries in a roll now: those whose `if` is true, in the order written. */
export const liveEntries = (table: LootTableRecord, holds: (condition: Condition) => boolean): LootEntry[] =>
  table.entries.filter((entry) => entry.if === undefined || holds(entry.if));

/**
 * One roll of a table over `live`, its entries in the roll: what it draws, in order, each with
 * its count. A nested table comes back as drawn, for the caller to roll. The picks and each count
 * are drawn even when their range is one number, so a later draw doesn't move when content does.
 */
export function draw(table: LootTableRecord, live: readonly LootEntry[], rng: Rng): Drawn[] {
  const picks = rangeOf(table.picks, 1);
  const times = rng.int(picks.min, picks.max);
  const left = [...live];
  const drawn: Drawn[] = [];
  for (let i = 0; i < times; i++) {
    const weights = [table.nothing ?? 0, ...left.map((entry) => entry.weight)];
    if (weights.every((weight) => weight === 0)) break;
    const index = rng.weightedIndex(weights);
    if (index === 0) continue;
    const entry = left[index - 1] as LootEntry;
    const count = rangeOf(entry.count, 1);
    drawn.push({ entry, count: rng.int(count.min, count.max) });
    if (table.unique) left.splice(index - 1, 1);
  }
  return drawn;
}

/** What an entry gives, as the previews and the checks name it. */
export function entryKind(entry: LootEntry): { kind: 'item' | 'table' | 'resource'; id: string } {
  if (entry.item !== undefined) return { kind: 'item', id: entry.item };
  if (entry.table !== undefined) return { kind: 'table', id: entry.table };
  if (entry.resource !== undefined) return { kind: 'resource', id: entry.resource };
  throw new Error('A loot entry names an item, a table or a resource');
}
