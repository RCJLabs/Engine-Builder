import type { Condition, FactTest, Op, Truth, Value } from './types.ts';

/** A test's fact, read now: its value, or undefined (or null) when it has none right now. */
export type FactReader = (test: FactTest) => unknown;

/**
 * Kleene's three-valued logic, as in who-am-i-'s condition evaluator: `all` is false if any part
 * is false, else unknown if any part is unknown; `any` is the mirror; `not` keeps unknown.
 * Stopping at the first deciding part doesn't change the answer, so the order of parts doesn't.
 * The condition is trusted: checkCondition it first if it came from outside a compiled pack.
 */
export function evaluate(condition: Condition, read: FactReader): Truth {
  if ('all' in condition) {
    let truth: Truth = true;
    for (const part of condition.all) {
      const value = evaluate(part, read);
      if (value === false) return false;
      if (value === null) truth = null;
    }
    return truth;
  }
  if ('any' in condition) {
    let truth: Truth = false;
    for (const part of condition.any) {
      const value = evaluate(part, read);
      if (value === true) return true;
      if (value === null) truth = null;
    }
    return truth;
  }
  if ('not' in condition) {
    const value = evaluate(condition.not, read);
    return value === null ? null : !value;
  }
  const actual = read(condition);
  if (condition.op === undefined) return typeof actual === 'boolean' ? actual : null;
  return compare(actual, condition.op, condition.value as Value);
}

/**
 * A fact with no value, or a value of another type than the one compared with, gives unknown
 * rather than false, so `not` of it is unknown too. Orderings compare numbers only.
 */
export function compare(actual: unknown, op: Op, expected: Value): Truth {
  if (typeof actual !== typeof expected || Number.isNaN(actual)) return null;
  if (op === '==') return actual === expected;
  if (op === '!=') return actual !== expected;
  if (typeof actual !== 'number') return null;
  const n = expected as number;
  if (op === '<') return actual < n;
  if (op === '<=') return actual <= n;
  if (op === '>') return actual > n;
  return actual >= n;
}
