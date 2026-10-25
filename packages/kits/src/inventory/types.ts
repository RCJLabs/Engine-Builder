/**
 * The inventory kit's records and state (M3.3, docs/specs/kits.md): items, loot tables, and the
 * party's bag. Content holds whole numbers only; a pack holds each `if` as a condition tree.
 */
import type { Condition } from '@eb/core';

/** The kit's id, its module's id and the key of its slice. */
export const INVENTORY = 'inventory';
export const ITEM = 'item';
export const LOOT_TABLE = 'loot-table';

/** records/item/<id>.json. A project may add fields of its own after these (D41); the kit reads only these. */
export interface ItemRecord {
  readonly name?: string;
  readonly description?: string;
  /** What it is worth, 0 when left out: shops price it from this. */
  readonly value?: number;
  /** The most the party can carry; no limit when left out. */
  readonly max?: number;
  /** Words shops and conditions choose items by. */
  readonly tags?: readonly string[];
}

/** From `min` to `max`, both whole numbers; `max` is `min` when left out. */
export interface Range {
  readonly min?: number;
  readonly max?: number;
}

/** One entry of a loot table: exactly one of `item`, `table` or `resource` (the last with the economy kit on). */
export interface LootEntry {
  readonly item?: string;
  readonly table?: string;
  readonly resource?: string;
  readonly weight: number;
  /** How many of the item or resource, or how many rolls of the table: 1 when left out. */
  readonly count?: Range;
  /** While this isn't true, the entry is out of the roll. */
  readonly if?: Condition;
}

/** records/loot-table/<id>.json */
export interface LootTableRecord {
  readonly name?: string;
  readonly description?: string;
  /** How many draws a roll makes: 1 when left out. */
  readonly picks?: Range;
  /** The weight of drawing nothing, 0 when left out. */
  readonly nothing?: number;
  /** An entry is drawn at most once a roll. */
  readonly unique?: boolean;
  readonly entries: readonly LootEntry[];
}

export interface InventorySlice {
  /** The party's items by id, each count 1 or more. */
  readonly bag: Readonly<Record<string, number>>;
  /** Version 2 (M6.1): by actor, its whole bag once anything in it has changed; its `carries` until then. */
  readonly bags: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/** A range's ends, with the defaults filled in. */
export function rangeOf(range: Range | undefined, fallback: number): { min: number; max: number } {
  const min = range?.min ?? fallback;
  return { min, max: range?.max ?? min };
}
