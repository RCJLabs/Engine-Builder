/**
 * Conditions: one tree for quests, dialogue, events, triggers and UI bindings
 * (docs/specs/conditions.md). Content writes them as JSON or as text, the sim evaluates them
 * with three-valued logic, and the lint asks whether each can ever be true.
 */

/** A value a condition compares a fact with, or passes as a fact's argument. */
export type Value = number | string | boolean;

export const OPS = ['==', '!=', '<', '<=', '>', '>='] as const;
export type Op = (typeof OPS)[number];

/**
 * A test of one fact: `{ "fact": "hold.count", "args": { "item": "medkit" }, "op": ">=", "value": 2 }`.
 * Without `op` and `value`, the fact is a yes/no fact and the test is that it holds.
 */
export interface FactTest {
  readonly fact: string;
  readonly args?: Readonly<Record<string, Value>>;
  readonly op?: Op;
  readonly value?: Value;
}

export type Condition =
  | { readonly all: readonly Condition[] }
  | { readonly any: readonly Condition[] }
  | { readonly not: Condition }
  | FactTest;

/** Three-valued truth. Null is unknown, so a plain `if` never treats unknown as true. */
export type Truth = boolean | null;

/** The values a fact, or one of its arguments, can take. */
export type Domain =
  | { readonly type: 'bool' }
  | { readonly type: 'int'; readonly min?: number; readonly max?: number }
  | { readonly type: 'number'; readonly min?: number; readonly max?: number }
  | { readonly type: 'enum'; readonly values: readonly (string | number)[] }
  /** The id of a record of this type. */
  | { readonly type: 'ref'; readonly to: string }
  | { readonly type: 'text' };

/** What a module says about one of its facts, for checking, wording and linting conditions. */
export interface FactInfo {
  /** Argument names and their values. A fact with exactly one argument can be written `fact(value)`. */
  readonly args?: Readonly<Record<string, Domain>>;
  /** The values the fact can have. Without one, the lint can't reason about the fact. */
  readonly domain?: Domain;
  /** How describe() names the fact, like "medkits carried". Defaults to the fact's name. */
  readonly label?: string;
  /** Better wording for one test of this fact ("Needs 2 medkits"), or undefined for the default. */
  readonly describe?: (test: FactTest) => string | undefined;
}

/** Every fact a game registers, by id ("hold.count"). */
export type FactCatalog = Readonly<Record<string, FactInfo>>;

/** A problem with a condition, at a JSON Pointer inside it. Codes are in @eb/schema's table. */
export interface ConditionIssue {
  readonly code: 'E011' | 'E012' | 'E013' | 'E014' | 'E044';
  readonly path: string;
  readonly message: string;
}
