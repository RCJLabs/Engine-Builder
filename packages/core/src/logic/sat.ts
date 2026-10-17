/**
 * "Can this ever be true?" for a condition, over the values its facts can take
 * (docs/specs/conditions.md). Each distinct fact-and-arguments is a variable. Its domain is cut
 * down to one value per class that the condition's tests can tell apart, such as below, at and
 * above each number compared with. Then every combination is tried, or a seeded sample when
 * there are too many. who-am-i-'s condition lint did the same search, with the same caps.
 */
import { canonicalJson } from '../canonical.ts';
import { Rng } from '../rng.ts';
import { evaluate } from './evaluate.ts';
import type { Condition, Domain, FactCatalog, FactTest, Truth, Value } from './types.ts';
import type { RecordIndex } from './values.ts';

/** Up to this many combinations of fact values, every one is tried. */
export const EXHAUSTIVE_LIMIT = 100_000;
/** Past it, this many seeded samples. */
export const SAMPLES = 20_000;

export interface Satisfiability {
  /** True when some values of the facts make it true; false when none do; null when a sample found none. */
  readonly canBeTrue: Truth;
  /** The same for false. A fact with no value makes any condition unknown, never true or false, so it is left out. */
  readonly canBeFalse: Truth;
  /** How many combinations of fact values tell the condition's tests apart. */
  readonly combinations: number;
  readonly exhaustive: boolean;
}

export interface SatOptions {
  /** Facts' domains. A fact without one can hold any value. */
  readonly catalog?: FactCatalog;
  /** The ids a ref domain can hold. Without it, some record other than those named is assumed to exist. */
  readonly records?: RecordIndex;
}

interface Variable {
  readonly fact: string;
  readonly tests: FactTest[];
}

export function satisfiability(condition: Condition, options: SatOptions = {}): Satisfiability {
  const slots = new Map<FactTest, number>();
  const variables = collect(condition, slots);
  const points = variables.map((variable) => pointsOf(variable, options));
  const combinations = points.reduce((n, p) => n * p.length, 1);
  const values: unknown[] = points.map((p) => p[0]);
  const read = (test: FactTest) => values[slots.get(test) as number];
  let canBeTrue = false;
  let canBeFalse = false;
  const tryValues = () => {
    const truth = evaluate(condition, read);
    if (truth === true) canBeTrue = true;
    if (truth === false) canBeFalse = true;
    return canBeTrue && canBeFalse;
  };
  if (combinations <= EXHAUSTIVE_LIMIT) {
    const counters = points.map(() => 0);
    for (let n = 0; n < combinations && !tryValues(); n++) advance(counters, points, values);
    return { canBeTrue, canBeFalse, combinations, exhaustive: true };
  }
  // A fixed seed, so a project gets the same verdict on every build.
  const rng = Rng.create('eb/condition-lint');
  for (let n = 0; n < SAMPLES; n++) {
    for (const [i, p] of points.entries()) values[i] = rng.pick(p);
    if (tryValues()) break;
  }
  return { canBeTrue: canBeTrue || null, canBeFalse: canBeFalse || null, combinations, exhaustive: false };
}

/** The next combination, like an odometer. */
function advance(counters: number[], points: readonly (readonly unknown[])[], values: unknown[]): void {
  for (const [i, p] of points.entries()) {
    const next = (counters[i] as number) + 1;
    counters[i] = next < p.length ? next : 0;
    values[i] = p[counters[i] as number];
    if (next < p.length) return;
  }
}

function collect(condition: Condition, slots: Map<FactTest, number>): Variable[] {
  const variables: Variable[] = [];
  const byKey = new Map<string, number>();
  const visit = (node: Condition): void => {
    if ('all' in node || 'any' in node) {
      for (const part of 'all' in node ? node.all : node.any) visit(part);
    } else if ('not' in node) {
      visit(node.not);
    } else {
      const key = node.args ? `${node.fact}${canonicalJson(node.args)}` : node.fact;
      let slot = byKey.get(key);
      if (slot === undefined) {
        slot = variables.push({ fact: node.fact, tests: [] }) - 1;
        byKey.set(key, slot);
      }
      variables[slot]?.tests.push(node);
      slots.set(node, slot);
    }
  };
  visit(condition);
  return variables;
}

/** One value for each class of values the tests can tell apart. */
function pointsOf(variable: Variable, options: SatOptions): readonly unknown[] {
  const constants = variable.tests.flatMap((test) => (test.op === undefined ? [] : [test.value as Value]));
  const strings = unique(constants.filter((c) => typeof c === 'string'));
  const numbers = unique(constants.filter((c) => typeof c === 'number'));
  const domain = options.catalog?.[variable.fact]?.domain;
  if (!domain) {
    const yesNo = variable.tests.some((test) => test.op === undefined) || constants.some((c) => typeof c === 'boolean');
    return [
      ...(yesNo ? [false, true] : []),
      ...(strings.length > 0 ? withOther(strings) : []),
      ...(numbers.length > 0 ? numberPoints(numbers, {}) : []),
    ];
  }
  return domainPoints(domain, strings, numbers, options.records);
}

function domainPoints(domain: Domain, strings: string[], numbers: number[], records?: RecordIndex): readonly unknown[] {
  switch (domain.type) {
    case 'bool':
      return [false, true];
    case 'text':
      return withOther(strings);
    case 'enum': {
      const named = domain.values.filter((v) => (typeof v === 'string' ? strings : numbers).includes(v as never));
      const other = domain.values.find((v) => !named.includes(v));
      return other === undefined ? named : [...named, other];
    }
    case 'ref': {
      if (!records) return withOther(strings);
      const named = strings.filter((id) => records.has(domain.to, id));
      const other = records.ids(domain.to).find((id) => !named.includes(id));
      return other === undefined ? named : [...named, other];
    }
    case 'int':
      return intPoints(numbers, domain);
    case 'number':
      return numberPoints(numbers, domain);
  }
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

/** The constants, plus one text equal to none of them. */
function withOther(strings: readonly string[]): string[] {
  let other = '';
  while (strings.includes(other)) other += '~';
  return [...strings, other];
}

// Strictly below and above any finite x, even where x ± 1 rounds back to x.
const below = (x: number) => x - 1 - Math.abs(x);
const above = (x: number) => x + 1 + Math.abs(x);

interface Bounds {
  readonly min?: number;
  readonly max?: number;
}

/** Each constant, a point between each neighbouring pair, and one beyond each end, inside the bounds. */
function numberPoints(constants: readonly number[], { min, max }: Bounds): number[] {
  const marks = unique([...constants, ...(min === undefined ? [] : [min]), ...(max === undefined ? [] : [max])]).sort(
    (a, b) => a - b,
  );
  const first = marks[0];
  const last = marks.at(-1);
  if (first === undefined || last === undefined) return [0];
  const points = [below(first), ...marks, above(last)];
  for (let i = 1; i < marks.length; i++) points.push((marks[i - 1] as number) / 2 + (marks[i] as number) / 2);
  return inside(unique(points), min, max);
}

/** For whole numbers: one below, at and above each whole constant; either side of a fractional one. */
function intPoints(constants: readonly number[], { min, max }: Bounds): number[] {
  const lo = min === undefined ? undefined : Math.ceil(min);
  const hi = max === undefined ? undefined : Math.floor(max);
  const points = constants.flatMap((c) =>
    Number.isSafeInteger(c)
      ? [c - 1, c, c + 1]
      : Number.isInteger(c)
        ? [below(c), c, above(c)]
        : [Math.floor(c), Math.ceil(c)],
  );
  if (lo !== undefined) points.push(lo);
  if (hi !== undefined) points.push(hi);
  if (points.length === 0) points.push(0);
  return inside(unique(points), lo, hi);
}

const inside = (points: number[], min: number | undefined, max: number | undefined): number[] =>
  points.filter((p) => (min === undefined || p >= min) && (max === undefined || p <= max)).sort((a, b) => a - b);
