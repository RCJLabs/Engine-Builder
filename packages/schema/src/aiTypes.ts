/**
 * The ai kit's record type (M6.3, D75, docs/specs/ai.md#behaviours): a behaviour, a tree of nodes.
 * Its layout is a type file, as a sheet's is (D36): a name, a description and `do`, which the
 * editor draws as an outline; its checks are zod's, `do` a node of its own recursive kind. Points'
 * names, lengths' units and hours' sense are E081's, once the spaces and the calendar are read.
 */
import { isRecordId, NAME_PATTERN } from '@eb/core';
import { BEHAVIOUR, type BehaviourNode } from '@eb/kits';
import { z } from 'zod';
import { condition } from './condition.ts';
import { effect } from './effect.ts';
import { defineRecordType } from './recordType.ts';
import type { TypeFile } from './typeFile.ts';
import { type DataType, typeFromFile } from './typeSchema.ts';

export const BEHAVIOUR_TYPE_FILE: TypeFile = {
  title: 'Behaviour',
  description: 'What an NPC does, and when: a tree of nodes the sim runs after every event.',
  nameField: 'name',
  fields: {
    name: { kind: 'text', min: 1, optional: true, label: 'Name' },
    description: { kind: 'text', multiline: true, optional: true, label: 'Description' },
    // Only sketched: the behaviour's form draws its tree as an outline, and zod checks it.
    do: { kind: 'map', label: 'Do', of: { kind: 'text' } },
  },
};

const point = z.string().refine((path) => path.split('/').every(isRecordId), {
  error: "Expected an object of the actor's space: ids joined by /",
});
const length = z
  .record(z.string().regex(NAME_PATTERN, { error: 'A unit is lowercase words joined by hyphens' }), z.int().min(1))
  .refine((units) => Object.keys(units).length > 0, { error: 'Give a length, like { "minutes": 20 }' });
const hour = z.int().min(0, { error: 'An hour is a whole number from 0' });
const points = z.array(point).min(1, { error: 'Give at least one point' });
const player = z.literal('player', { error: 'Only "player"' });

/** The keys that name a node's kind, and what each may have beside it. */
const KINDS: Readonly<Record<string, readonly string[]>> = {
  first: [],
  'in-order': [],
  do: ['if', 'hours', 'days', 'cooldown'],
  travel: [],
  sleep: [],
  work: [],
  patrol: ['dwell'],
  sandbox: ['dwell'],
  follow: ['distance'],
  wait: [],
  face: [],
  effects: [],
  attack: [],
};
const NODE_WORDS =
  'a node is first, in-order, a guard (if, hours or days, and do), or travel, sleep, work, patrol, sandbox, follow, wait, face, effects or attack';

/**
 * A node as one strict object of every key a node can have, which says exactly one of them names
 * its kind and the rest go with it: so a problem deep in a tree is at its place, not a union's.
 */
export const nodeSchema: z.ZodType<BehaviourNode> = z.lazy(() =>
  z
    .strictObject({
      first: z.array(nodeSchema).min(1, { error: 'Give it a node' }).optional(),
      'in-order': z.array(nodeSchema).min(1, { error: 'Give it a node' }).optional(),
      if: condition().optional(),
      hours: z.tuple([hour, hour]).optional(),
      days: z.array(z.string().regex(NAME_PATTERN)).min(1).optional(),
      cooldown: length.optional(),
      do: nodeSchema.optional(),
      travel: point.optional(),
      sleep: point.optional(),
      work: point.optional(),
      patrol: points.optional(),
      sandbox: points.optional(),
      dwell: length.optional(),
      follow: player.optional(),
      distance: z.number().positive().max(50).optional(),
      wait: length.optional(),
      face: player.optional(),
      effects: z.array(effect()).min(1, { error: 'Give it an effect' }).optional(),
      // With the fighting kit on (M6.4, D76): E081 when it is off, as the kits are the compiler's to know.
      attack: player.optional(),
    })
    .superRefine((node, ctx) => {
      const given = Object.keys(node).filter((key) => (node as Record<string, unknown>)[key] !== undefined);
      const kinds = given.filter((key) => Object.hasOwn(KINDS, key));
      if (kinds.length !== 1) {
        const message =
          kinds.length === 0 ? `Expected a node: ${NODE_WORDS}` : `One node is ${kinds.join(' or ')}, not both`;
        ctx.addIssue({ code: 'custom', message });
        return;
      }
      const kind = kinds[0] as string;
      const allowed = new Set([kind, ...(KINDS[kind] ?? [])]);
      for (const key of given.filter((k) => !allowed.has(k)))
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} doesn't go with ${kind}` });
      if (kind === 'sandbox' && !given.includes('dwell'))
        ctx.addIssue({ code: 'custom', path: ['sandbox'], message: 'A sandbox waits a dwell at each point: give one' });
    }),
) as z.ZodType<BehaviourNode>;

/** A behaviour as its form and its checks see it: the type file's layout, and `do` checked as a node. */
export function behaviourData(file: TypeFile = BEHAVIOUR_TYPE_FILE): DataType {
  const base = typeFromFile(BEHAVIOUR, file);
  const schema = (base.recordType.schema as z.ZodObject).extend({ do: nodeSchema });
  const description = file.description ?? BEHAVIOUR_TYPE_FILE.description ?? '';
  return { ...base, recordType: defineRecordType({ type: BEHAVIOUR, title: file.title, description, schema }) };
}
