/**
 * The gear kit's records and state (M3.4, D42, docs/specs/stats.md): slots, and the items worn in
 * them, which leave the party's bag. The kit adds fields to the inventory kit's items and to the
 * stats kit's actors; the state holds only what differs from the actors' records.
 */
import type { ItemRecord } from '../inventory/types.ts';
import type { ActorRecord, Modifier } from '../stats/types.ts';

/** The kit's id, its module's id and the key of its slice. */
export const GEAR = 'gear';
export const SLOT = 'slot';

/** records/slot/<id>.json */
export interface SlotRecord {
  readonly name?: string;
  readonly description?: string;
  /** Item tags it can wear: an item with no slot of its own fits any slot taking one of its tags (M4.12). */
  readonly takes?: readonly string[];
}

/** An item with the gear kit on. */
export interface WearableItem extends ItemRecord {
  /** Where it is worn: left out, any slot that takes one of its tags, else it can't be. */
  readonly slot?: string;
  /** What it does while worn, as a status's modifiers do. */
  readonly modifiers?: readonly Modifier[];
}

/** An actor with the gear kit on. */
export interface WearingActor extends ActorRecord {
  /** The slots it has: every slot when left out. */
  readonly slots?: readonly string[];
  /** What it starts wearing, by slot: from no bag. */
  readonly wears?: Readonly<Record<string, string>>;
}

export interface GearSlice {
  /** By actor, by slot: the item worn, or null for a slot emptied, where it differs from the record. */
  readonly worn: Readonly<Record<string, Readonly<Record<string, string | null>>>>;
}
