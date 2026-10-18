import { FLAG } from '@eb/core';
import { LOOT_TABLE, SHOP } from '@eb/kits';
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
