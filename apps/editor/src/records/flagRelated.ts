import { FLAG } from '@eb/core';
import { ACTOR, GEAR, ITEM, LOOT_TABLE, SHOP, STAT, STATS } from '@eb/kits';
import type { IndexedRecord } from './recordIndex.ts';

/**
 * A flag, or a record that names one: the records whose checks read each other (M3.1). A flag's
 * lint reads every record that names it, and a set-flag's check reads the flag. Its own module,
 * so the record form's checks don't bring the index with them.
 */
export const flagRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === FLAG || record.refs.some((ref) => ref.to.startsWith(`${FLAG}:`)));

/**
 * A loot table or a shop (M3.3): a table's loop check (E036) and a shop's stock check read every
 * table, so a change to one checks them all again, as a flag's does.
 */
export const lootRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === LOOT_TABLE || record.type === SHOP);

/**
 * A stat or an actor (M3.4): an actor's bases are checked against its stats' bounds, so a change
 * to either checks both again; with the gear kit on, an item or an actor, since what an actor
 * wears is checked against the items' slots.
 */
export const statRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === STAT || record.type === ACTOR);
export const wornRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === ITEM || record.type === ACTOR);

/** The checks that read other records, for the kits on. */
export const relatedFor = (kits: readonly string[]): ((record: IndexedRecord | undefined) => boolean)[] => [
  flagRelated,
  lootRelated,
  ...(kits.includes(STATS) ? [statRelated] : []),
  ...(kits.includes(GEAR) ? [wornRelated] : []),
];
