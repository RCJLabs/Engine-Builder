/**
 * Why a sound, an ambience or a music a ui file names isn't there (M4.8, D58): E049, as for a
 * screen a button opens. Undefined when it is, or when the records aren't known.
 */
import type { RecordIndex } from '@eb/core';

export function missingRecord(
  records: RecordIndex | undefined,
  type: string,
  id: string | undefined,
): string | undefined {
  if (id === undefined || records === undefined || records.has(type, id)) return undefined;
  return `There’s no ${type} record "${id}"`;
}
