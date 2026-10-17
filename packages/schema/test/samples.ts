/**
 * Sample record types for the tests, shaped like Space-Wrecked content: items, actors, and loot
 * tables with conditions and effects. Between them they put references in every place the
 * walker must look: plain and described fields, record keys, tuples, arrays, a lazy recursive
 * union, and a discriminated union.
 */
import { defineRecordType, ref, refAny, z } from '../src/index.ts';

// Types as a game's pure code would declare them; the schemas below must match them.
export interface Item {
  name: string;
  weight: number;
  tags?: string[];
}

export interface Actor {
  name: string;
  carries?: Record<string, number>;
  drops?: string;
  hands?: [string | null, string | null];
}

export type Condition = { flag: string } | { all: Condition[] } | { has: string };

export type Effect =
  | { op: 'give'; item: string; count: number }
  | { op: 'spawn'; actor: string }
  | { op: 'mark'; target: string };

export interface LootTable {
  rolls: [number, number];
  entries: { item: string; weight: number }[];
  when?: Condition;
  effects?: Effect[];
}

export const item = defineRecordType<Item>({
  type: 'item',
  title: 'Item',
  description: 'Something a crew member can carry.',
  schema: z.strictObject({
    name: z.string().min(1),
    weight: z.number().min(0),
    tags: z.array(z.string()).optional(),
  }),
});

export const actor = defineRecordType<Actor>({
  type: 'actor',
  title: 'Actor',
  description: 'A person or creature the crew can meet.',
  schema: z.strictObject({
    name: z.string().min(1),
    carries: z.record(ref('item'), z.int().min(1)).optional(),
    drops: ref('loot-table').describe('What a search of the body turns up').optional(),
    hands: z.tuple([ref('item').nullable(), ref('item').nullable()]).optional(),
  }),
});

const condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ flag: z.string() }),
    z.strictObject({ all: z.array(condition) }),
    z.strictObject({ has: ref('item') }),
  ]),
);

const effect: z.ZodType<Effect> = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('give'), item: ref('item'), count: z.int().min(1) }),
  z.strictObject({ op: z.literal('spawn'), actor: ref('actor') }),
  z.strictObject({ op: z.literal('mark'), target: refAny(['item', 'actor']) }),
]);

export const lootTable = defineRecordType<LootTable>({
  type: 'loot-table',
  title: 'Loot table',
  description: 'What a search or a body turns up.',
  schema: z.strictObject({
    rolls: z.tuple([z.int().min(0), z.int().min(0)]),
    entries: z.array(z.strictObject({ item: ref('item'), weight: z.int().min(1) })),
    when: condition.optional(),
    effects: z.array(effect).optional(),
  }),
});

export const sampleTypes = [item, actor, lootTable];
