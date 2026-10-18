import { parseCondition, pointerKeys } from '@eb/core';
import type { z } from 'zod';
import { isEffectShape } from './effect.ts';
import { type KnownOptions, knownFrom } from './known.ts';
import { scanRecord } from './walk.ts';

/**
 * A record's value as the pack holds it: each condition written as text replaced by its tree
 * (D31), inside the effects the catalogue knows too (M3.1), so the runtime only ever reads trees.
 * The value it was given is left as it was. Called only on records that passed validation, where
 * every text parses with the same facts.
 */
export function packValue(schema: z.core.$ZodType, value: unknown, options: KnownOptions = {}): unknown {
  return pack(schema, value, options, false);
}

function pack(schema: z.core.$ZodType, value: unknown, options: KnownOptions, self: boolean): unknown {
  const known = knownFrom(options);
  const found = scanRecord(schema, value);
  const changes: [string, unknown][] = [];
  for (const { path, value: text } of found.conditions) {
    if (typeof text !== 'string') continue;
    const parsed = parseCondition(text, known.facts);
    if (!parsed.ok) throw new Error(`packValue: the condition at ${path} does not parse: ${parsed.message}`);
    changes.push([path, parsed.condition]);
  }
  for (const { path, value: inner, open } of found.effects) {
    if (!open || (self && path === '') || !isEffectShape(inner)) continue;
    // An effect the catalogue doesn't know is kept as written (D36).
    const effectSchema = known.effects.schemas.get(inner.effect);
    const packed = effectSchema ? pack(effectSchema, inner, options, true) : inner;
    if (packed !== inner) changes.push([path, packed]);
  }
  if (changes.length === 0) return value;
  // A record's value is JSON read from a file, so a JSON round trip copies it exactly.
  const copy: unknown = JSON.parse(JSON.stringify(value));
  for (const [path, next] of changes) {
    const keys = pointerKeys(path);
    const last = keys.pop();
    // A record's top level is an object, so a condition or an effect always has a parent and a key.
    if (last === undefined) throw new Error('packValue: a record is an object, not a condition');
    let parent = copy as Record<string, unknown>;
    for (const key of keys) parent = parent[key] as Record<string, unknown>;
    parent[last] = next;
  }
  return copy;
}
