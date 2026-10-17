import type { Condition, FactCatalog, FactTest, Op } from './types.ts';

const WORDS: Readonly<Record<Op, string>> = {
  '==': 'is',
  '!=': 'is not',
  '<': 'is less than',
  '<=': 'is at most',
  '>': 'is more than',
  '>=': 'is at least',
};

// `not (x < 3)` is `x >= 3` in three-valued logic too: both are unknown when x has no number.
const OPPOSITE: Readonly<Record<Op, Op>> = { '==': '!=', '!=': '==', '<': '>=', '<=': '>', '>': '<=', '>=': '<' };

/**
 * A condition in words, for a tooltip or a locked choice: "Needs 2 medkits and not night".
 * A fact's own `describe` wins; otherwise its `label` (or its name) and the comparison. Parts
 * start lowercase and the whole gets a capital, so fact wordings should start lowercase too.
 * English only, until string tables arrive.
 */
export function describeCondition(condition: Condition, catalog: FactCatalog = {}): string {
  const text = phrase(condition, catalog);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function phrase(condition: Condition, catalog: FactCatalog): string {
  if ('all' in condition)
    return list(
      condition.all.map((c) => part(c, catalog)),
      'and',
    );
  if ('any' in condition)
    return list(
      condition.any.map((c) => part(c, catalog)),
      'or',
    );
  if ('not' in condition) {
    const inner = condition.not;
    if ('fact' in inner && inner.op !== undefined) return test({ ...inner, op: OPPOSITE[inner.op] }, catalog);
    return `not ${part(inner, catalog)}`;
  }
  return test(condition, catalog);
}

const part = (c: Condition, catalog: FactCatalog): string =>
  'all' in c || 'any' in c ? `(${phrase(c, catalog)})` : phrase(c, catalog);

/** "a and b", "a, b and c". */
const list = (parts: readonly string[], word: string): string =>
  parts.length <= 2 ? parts.join(` ${word} `) : `${parts.slice(0, -1).join(', ')} ${word} ${parts.at(-1)}`;

function test(condition: FactTest, catalog: FactCatalog): string {
  const info = catalog[condition.fact];
  const own = info?.describe?.(condition);
  if (own !== undefined) return own;
  const args = Object.keys(condition.args ?? {})
    .sort()
    .map((key) => String(condition.args?.[key]));
  const name = info?.label ?? condition.fact.replace(/[.-]/g, ' ');
  const subject = args.length > 0 ? `${name} (${args.join(', ')})` : name;
  const { op, value } = condition;
  if (op === undefined) return subject;
  // "night", not "night is true".
  if (typeof value === 'boolean' && (op === '==' || op === '!='))
    return value === (op === '==') ? subject : `not ${subject}`;
  return `${subject} ${WORDS[op]} ${String(value)}`;
}
