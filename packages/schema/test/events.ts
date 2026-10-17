/**
 * A sample event type with conditions and rolls, as Space-Wrecked's events have, and the facts
 * a game would check them against.
 */
import type { Condition, Effect, FactCatalog } from '@eb/core';
import { condition, defineRecordType, ref, rollEffect, z } from '../src/index.ts';
import { sampleTypes } from './samples.ts';

export interface EventRecord {
  when?: Condition;
  choices: Record<string, { when?: Condition; effects: Effect[] }>;
}

const effect: z.ZodType<Effect> = z.lazy(() =>
  z.discriminatedUnion('effect', [
    z.strictObject({ effect: z.literal('give'), item: ref('item') }),
    rollEffect(effect),
  ]),
);

export const event = defineRecordType<EventRecord>({
  type: 'event',
  title: 'Event',
  description: 'A choice the crew faces.',
  schema: z.strictObject({
    when: condition().optional(),
    choices: z.record(
      z.string(),
      z.strictObject({
        when: condition().describe('Offered only while this holds').optional(),
        effects: z.array(effect),
      }),
    ),
  }),
});

export const eventTypes = [...sampleTypes, event];

export const facts: FactCatalog = {
  'hold.count': { args: { item: { type: 'ref', to: 'item' } }, domain: { type: 'int', min: 0 } },
  'hold.credits': { domain: { type: 'int', min: 0 } },
  'hold.slot': { args: { i: { type: 'int' } }, domain: { type: 'int', min: 0, max: 100 } },
  'voyage.night': { domain: { type: 'bool' } },
  'voyage.leader': { domain: { type: 'ref', to: 'actor' } },
};
