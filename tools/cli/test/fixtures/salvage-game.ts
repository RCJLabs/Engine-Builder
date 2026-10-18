/**
 * Salvage run as a game module for `eb sim`: the modules from @eb/core's tests, the record types
 * of its project folder (packages/core/test/fixtures/salvage-run), two bots and the facts worth
 * measuring. A game's own repo would hold a file like this one.
 */
import { type Effect, weightedPolicy } from '@eb/core';
import {
  addToFlagEffect,
  cancelTimerEffect,
  condition,
  defineRecordType,
  effect,
  ref,
  rollEffect,
  scheduleEffect,
  setFlagEffect,
  waitEffect,
  z,
} from '@eb/schema';
import { salvageModules } from '../../../../packages/core/test/salvage.ts';

const calendar = { ticksPerDay: 1 };

/** Every effect the game has (M3.1): content may name no other, and each is checked by its schema. */
export const effects = [
  rollEffect(effect()),
  waitEffect(calendar),
  scheduleEffect(effect(), calendar),
  cancelTimerEffect(),
  setFlagEffect(),
  addToFlagEffect(),
  z.strictObject({ effect: z.literal('loot'), table: ref('loot-table') }),
  z.strictObject({ effect: z.literal('wound'), hp: z.int().min(1) }),
  z.strictObject({ effect: z.literal('heal'), hp: z.int().min(1) }),
  z.strictObject({ effect: z.literal('sell'), item: ref('item') }),
  z.strictObject({ effect: z.literal('credits'), delta: z.int() }),
];

const item = defineRecordType<{ value: number }>({
  type: 'item',
  title: 'Item',
  description: 'Something the hold can carry and sell.',
  schema: z.strictObject({ value: z.int().min(0) }),
});

const lootTable = defineRecordType<{ entries: { item: string; weight: number }[] }>({
  type: 'loot-table',
  title: 'Loot table',
  description: 'What looting a wreck can turn up, and how often.',
  schema: z.strictObject({
    entries: z.array(z.strictObject({ item: ref('item'), weight: z.int().min(1) })).min(1),
  }),
});

const event = defineRecordType<{ choices: Record<string, { when?: unknown; effects: Effect[] }> }>({
  type: 'event',
  title: 'Event',
  description: 'What the crew meets after a jump, and the choices it offers.',
  schema: z.strictObject({
    choices: z.record(
      z.string(),
      z.strictObject({
        when: condition().describe('Offered only while this holds').optional(),
        effects: z.array(effect()),
      }),
    ),
  }),
});

export const recordTypes = [item, lootTable, event];
export const modules = salvageModules;
export const start = 'travel';
export const policies = [
  // Rests one turn in three while someone is hurt, as the bot in the kernel tests does.
  weightedPolicy('steady', { 'crew/rest': 1, 'voyage/jump': 2 }),
  // Never rests. Resting costs salvage run no time, so a bot that rests whenever hurt never loses.
  weightedPolicy('reckless', { 'crew/rest': 0 }),
];
export const metrics = ['voyage.ending', 'crew.alive', 'hold.credits', 'time.day'];
