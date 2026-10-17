import { type FactCatalog, parseCondition, pointerKeys } from '@eb/core';
import type { z } from 'zod';
import { scanRecord } from './walk.ts';

/**
 * A record's value as the pack holds it: each condition written as text replaced by its tree
 * (D31), so the runtime only ever reads trees. The value it was given is left as it was. Called
 * only on records that passed validation, where every text parses with the same facts.
 */
export function packValue(schema: z.core.$ZodType, value: unknown, facts?: FactCatalog): unknown {
  const texts = scanRecord(schema, value).conditions.filter((found) => typeof found.value === 'string');
  if (texts.length === 0) return value;
  // A record's value is JSON read from a file, so a JSON round trip copies it exactly.
  const copy: unknown = JSON.parse(JSON.stringify(value));
  for (const { path, value: text } of texts) {
    const parsed = parseCondition(text as string, facts);
    if (!parsed.ok) throw new Error(`packValue: the condition at ${path} does not parse: ${parsed.message}`);
    const keys = pointerKeys(path);
    const last = keys.pop();
    // A record's top level is an object, so a condition always has a parent and a key.
    if (last === undefined) throw new Error('packValue: a record is an object, not a condition');
    let parent = copy as Record<string, unknown>;
    for (const key of keys) parent = parent[key] as Record<string, unknown>;
    parent[last] = parsed.condition;
  }
  return copy;
}
