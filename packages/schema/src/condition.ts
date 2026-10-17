import {
  type Condition,
  type Effect,
  FACT_PATTERN,
  isPrintableNumber,
  NAME_PATTERN,
  OPS,
  type RollEffect,
} from '@eb/core';
import { z } from 'zod';

/**
 * The metadata key that marks a condition field. It reaches the JSON Schema export unchanged,
 * so the editor knows to offer the condition editor for the field.
 */
export const CONDITION_KEY = 'x-eb-condition';

const value = z.union([
  z.string(),
  z.boolean(),
  z.number().refine(isPrintableNumber, { error: 'A number without an exponent' }),
]);
const args = z
  .record(z.string().regex(NAME_PATTERN), value)
  .refine((given) => Object.keys(given).length > 0, { error: 'Leave args out when there are none' });
const fact = z.string().regex(FACT_PATTERN);

// The same rules as @eb/core's checkCondition, which a test holds them to. Validation reports
// checkCondition's messages (E011) instead of zod's; this schema is for the JSON Schema export,
// and so that a record parses only when its conditions are sound.
const tree: z.ZodType<Condition> = z
  .lazy(() =>
    z.union([
      z.strictObject({ all: z.array(tree).min(2) }),
      z.strictObject({ any: z.array(tree).min(2) }),
      z.strictObject({ not: tree }),
      z.strictObject({ fact, args: args.optional() }),
      z.strictObject({ fact, args: args.optional(), op: z.enum(OPS), value }),
    ]),
  )
  .meta({
    id: 'eb-condition',
    [CONDITION_KEY]: true,
    description:
      'A condition (docs/specs/conditions.md), like {"fact": "hold.count", "args": {"item": "medkit"}, "op": ">=", "value": 2}',
  });

/**
 * A field that holds a condition: `when: condition().optional()`. Validation checks it against
 * the game's facts (E011 to E014) and asks whether it can ever be true (W102 to W104).
 */
export const condition = (): z.ZodType<Condition> => tree;

/** Whether a schema is a condition field, through .describe() and .meta() copies too. */
export const isConditionSchema = (schema: z.core.$ZodType): boolean =>
  z.globalRegistry.get(schema)?.[CONDITION_KEY] === true;

/**
 * The roll effect's schema, for a game's union of effects: whole-percent chances that add up to
 * 100, each with the effects it applies (`effect` is that union, for rolls inside rolls).
 */
export function rollEffect(effect: z.ZodType<Effect>) {
  const outcome = z.strictObject({
    chance: z.int().min(1).max(100),
    text: z.string().min(1).optional(),
    effects: z.array(effect),
  });
  // A concrete object schema, so it can join a discriminated union on "effect".
  return z.strictObject({
    effect: z.literal('roll'),
    outcomes: z
      .array(outcome)
      .min(1)
      .refine((outcomes) => outcomes.reduce((sum, o) => sum + o.chance, 0) === 100, {
        error: "A roll's chances add up to 100",
      }),
  }) satisfies z.ZodType<RollEffect>;
}
