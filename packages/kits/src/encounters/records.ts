/** The encounters kit's records, read by id: validation stops content naming one that isn't there (E005). */
import type { RecordStore } from '@eb/core';
import { COMBAT, type CombatRecord, ENCOUNTER, type EncounterRecord } from './types.ts';

export function encounterRecord(content: RecordStore, id: unknown): EncounterRecord {
  if (typeof id !== 'string' || !content.has(ENCOUNTER, id)) throw new Error(`No encounter "${String(id)}"`);
  return content.get(ENCOUNTER, id) as EncounterRecord;
}

export function combatRecord(content: RecordStore, id: unknown): CombatRecord {
  if (typeof id !== 'string' || !content.has(COMBAT, id)) throw new Error(`No combat "${String(id)}"`);
  return content.get(COMBAT, id) as CombatRecord;
}
