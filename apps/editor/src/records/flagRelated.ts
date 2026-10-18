import { FLAG } from '@eb/core';
import type { IndexedRecord } from './recordIndex.ts';

/**
 * A flag, or a record that names one: the records whose checks read each other (M3.1). A flag's
 * lint reads every record that names it, and a set-flag's check reads the flag. Its own module,
 * so the record form's checks don't bring the index with them.
 */
export const flagRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === FLAG || record.refs.some((ref) => ref.to.startsWith(`${FLAG}:`)));
