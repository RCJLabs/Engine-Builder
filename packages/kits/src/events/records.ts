/** The events kit's records, read by id: validation stops content naming one that isn't there (E005). */
import type { RecordStore } from '@eb/core';
import { type Choice, DECK, type DeckRecord, EVENT, type EventRecord } from './types.ts';

function recordOf<T>(content: RecordStore, type: string, id: unknown): T {
  if (typeof id !== 'string' || !content.has(type, id)) throw new Error(`No ${type} "${String(id)}"`);
  return content.get(type, id) as T;
}

export const eventRecord = (content: RecordStore, id: unknown) => recordOf<EventRecord>(content, EVENT, id);
export const deckRecord = (content: RecordStore, id: unknown) => recordOf<DeckRecord>(content, DECK, id);

/** The event's choice of that id, or undefined. */
export const choiceOf = (event: EventRecord, id: unknown): Choice | undefined =>
  event.choices.find((choice) => choice.id === id);

/** The choice, or a thrown error: E041 stops a condition naming one its event doesn't have. */
export function namedChoice(content: RecordStore, event: unknown, id: unknown): Choice {
  const choice = choiceOf(eventRecord(content, event), id);
  if (!choice) throw new Error(`The event "${String(event)}" has no choice "${String(id)}"`);
  return choice;
}
