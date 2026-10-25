/**
 * Effects in records (M3.1, D36). `effect()` marks a field that holds one, as condition() marks a
 * condition: zod checks only that it names itself, and validation checks the rest against the
 * effects known (effectCheck.ts), the engine's own or, with a game's `effects`, exactly those.
 * The engine's own effect schemas carry their names the same way, so the flag lint finds a
 * set-flag inside a game's own union of effects too.
 */
import { type AddToFlagEffect, type Effect, FLAG, isRecordId, type RollEffect, type SetFlagEffect } from '@eb/core';
import { z } from 'zod';
import { ref } from './refs.ts';
import { literalValues, view } from './zodView.ts';

/**
 * The metadata key that marks an effect: true on an `effect()` field, the effect's name on one of
 * the engine's effect schemas. It reaches the JSON Schema export unchanged.
 */
export const EFFECT_KEY = 'x-eb-effect';

// Any JSON, for an effect's fields. Its own schema checks them, in a pass of its own, so its
// messages name the effect's fields rather than zod's "Invalid input" for a union with no match.
const json: z.ZodType<unknown> = z
  .lazy(() => z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(json), z.record(z.string(), json)]))
  .meta({ id: 'eb-json', description: 'Any JSON value' });

const field = z
  .record(z.string(), json, { error: 'Expected an effect: {"effect": "set-flag", …}' })
  .refine((value) => isRecordId(value.effect), { error: 'An effect names itself: {"effect": "set-flag", …}' })
  .meta({
    id: 'eb-effect',
    [EFFECT_KEY]: true,
    description: 'An effect (docs/specs/triggers.md), like {"effect": "set-flag", "flag": "met-trader", "to": true}',
    required: ['effect'],
  });

/**
 * A field that holds an effect: `do: z.array(effect())`. Validation checks it against the effect
 * catalogue (E001 inside it, E025 for one the game doesn't have), and packing turns any condition
 * text inside a known effect into its tree.
 */
export const effect = (): z.ZodType<Effect> => field as unknown as z.ZodType<Effect>;

/** True for an effect() field, the effect's name for one of the engine's effect schemas, or undefined. */
export function effectMark(schema: z.core.$ZodType): true | string | undefined {
  const mark: unknown = z.globalRegistry.get(schema)?.[EFFECT_KEY];
  return mark === true || isRecordId(mark) ? mark : undefined;
}

/** A value shaped like an effect: an object that names itself. What an effect() field holds once zod passes it. */
export const isEffectShape = (value: unknown): value is Effect =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && isRecordId((value as Effect).effect);

/** An effect's schema, marked with its name: a strict object whose `effect` is that name. */
export const named = <S extends z.ZodObject>(name: string, schema: S): S => schema.meta({ [EFFECT_KEY]: name }) as S;

/** `{ "effect": "set-flag", "flag": "met-trader", "to": true }`: `to` is a whole number for a number flag. */
export const setFlagEffect = () =>
  named(
    'set-flag',
    z.strictObject({
      effect: z.literal('set-flag'),
      flag: ref(FLAG),
      to: z.union([z.boolean(), z.int()], { error: 'Expected true or false, or a whole number' }),
    }),
  ) satisfies z.ZodType<SetFlagEffect>;

/** `{ "effect": "add-to-flag", "flag": "raids", "by": 1 }`, for a number flag. */
export const addToFlagEffect = () =>
  named(
    'add-to-flag',
    z.strictObject({
      effect: z.literal('add-to-flag'),
      flag: ref(FLAG),
      by: z.int({ error: 'Expected a whole number' }),
    }),
  ) satisfies z.ZodType<AddToFlagEffect>;

/**
 * The roll effect's schema, for a game's union of effects: whole-percent chances that add up to
 * 100, each with the effects it applies (`effect` is that union, or effect() for the catalogue's).
 */
export function rollEffect(effect: z.ZodType<Effect>) {
  const outcome = z.strictObject({
    chance: z.int().min(1).max(100),
    text: z.string().min(1).optional(),
    effects: z.array(effect),
  });
  // A concrete object schema, so it can join a discriminated union on "effect".
  return named(
    'roll',
    z.strictObject({
      effect: z.literal('roll'),
      outcomes: z
        .array(outcome)
        .min(1)
        .refine((outcomes) => outcomes.reduce((sum, o) => sum + o.chance, 0) === 100, {
          error: "A roll's chances add up to 100",
        }),
    }),
  ) satisfies z.ZodType<RollEffect>;
}

const objectPath = z
  .string()
  .refine((path) => path.split('/').every(isRecordId), { error: "Expected an object's path: ids joined by /" });

/**
 * `{ "effect": "enter-space", "space": "bothy", "spawn": "door" }` (M5.9, D71): the player moves to
 * a space, at a spawn point or at its start. E076 checks both names once the spaces are read.
 */
export const enterSpaceEffect = () =>
  named(
    'enter-space',
    z.strictObject({
      effect: z.literal('enter-space'),
      space: z.string().refine(isRecordId, { error: "Expected a space's id" }),
      spawn: objectPath.optional(),
    }),
  );

/**
 * `{ "effect": "walk-to", "actor": "carter", "to": "well" }` (M6.2, D74): a placed actor's goal
 * becomes an object of its space, which the stage walks it to. E079 checks both once the spaces are read.
 */
export const walkToEffect = () =>
  named(
    'walk-to',
    z.strictObject({
      effect: z.literal('walk-to'),
      actor: z.string().refine(isRecordId, { error: "Expected an actor's id" }),
      to: objectPath,
    }),
  );

/**
 * `{ "effect": "follow", "actor": "dog", "distance": 3 }` (M6.3, D75): a placed actor follows the
 * player, keeping `distance` metres off (2 when left out). E079 checks the actor once the spaces are read.
 */
export const followEffect = () =>
  named(
    'follow',
    z.strictObject({
      effect: z.literal('follow'),
      actor: z.string().refine(isRecordId, { error: "Expected an actor's id" }),
      distance: z.number().positive({ error: 'Metres, more than 0' }).max(50).optional(),
    }),
  );

/** `{ "effect": "stand", "actor": "guard", "facing": "player" }` (M6.3): stops a placed actor, turned to the player or not. */
export const standEffect = () =>
  named(
    'stand',
    z.strictObject({
      effect: z.literal('stand'),
      actor: z.string().refine(isRecordId, { error: "Expected an actor's id" }),
      facing: z.literal('player', { error: 'It faces only "player"' }).optional(),
    }),
  );

/** The effects validation knows, by name. */
export interface EffectCatalog {
  readonly schemas: ReadonlyMap<string, z.core.$ZodType>;
  /** True when these are every effect there is: a game's, given by `--types`. Otherwise one not here is kept as written. */
  readonly closed: boolean;
  /**
   * Effects the game has whose arguments it doesn't describe: a project game's own, known by name
   * from its modules (M3.2). Each is kept as written; its handler checks it when it runs.
   */
  readonly names?: ReadonlySet<string>;
}

/** Each schema's effect name: the literal of its `effect` field. Throws on a programmer error. */
export function effectCatalog(schemas: readonly z.core.$ZodType[], closed: boolean): EffectCatalog {
  const byName = new Map<string, z.core.$ZodType>();
  for (const schema of schemas) {
    const shape = view(schema);
    const names = shape.kind === 'object' && shape.shape.effect ? literalValues(shape.shape.effect) : undefined;
    const name = names?.length === 1 ? names[0] : undefined;
    if (typeof name !== 'string' || !isRecordId(name)) {
      throw new Error('Each effect schema is a z.strictObject whose "effect" is z.literal of its name');
    }
    if (byName.has(name)) throw new Error(`Two effect schemas are named "${name}"`);
    byName.set(name, schema);
  }
  return Object.freeze({ schemas: byName, closed });
}

/** The engine's own effects (D36), which every project knows: the rest are kept as written, without `--types`. */
export const ENGINE_EFFECTS: EffectCatalog = effectCatalog(
  [
    setFlagEffect(),
    addToFlagEffect(),
    rollEffect(effect()),
    enterSpaceEffect(),
    walkToEffect(),
    followEffect(),
    standEffect(),
  ],
  false,
);
