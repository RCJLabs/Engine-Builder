/**
 * A screen's fact or condition as written, parsed and checked against the game once. One that
 * doesn't read, or names what the game lacks, reads as no value rather than throwing in the kernel:
 * the compiler has said why (E048).
 */
import { type Condition, checkCondition, type FactCatalog, parseCondition } from '@eb/core';

/**
 * `bare` is a fact shown as its value rather than tested, so it needn't be yes or no (E014).
 * `slots` are the names a codex's item may use, `@entry` (M4.4).
 */
export function soundCondition(
  text: string,
  catalog: FactCatalog,
  bare: boolean,
  slots?: Readonly<Record<string, string>>,
): Condition | undefined {
  const parsed = parseCondition(text, catalog);
  if (!parsed.ok || (bare && !('fact' in parsed.condition && parsed.condition.op === undefined))) return undefined;
  const issues = checkCondition(parsed.condition, { catalog, ...(slots ? { slots } : {}) }).filter(
    (i) => !(bare && i.code === 'E014'),
  );
  return issues.length === 0 ? parsed.condition : undefined;
}
