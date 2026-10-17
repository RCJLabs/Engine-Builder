import { pointerSegment } from '@eb/core';
import { z } from 'zod';
import { isConditionSchema } from './condition.ts';
import { type RefTarget, refTargetOf } from './refs.ts';
import { view } from './zodView.ts';

export interface FoundRef {
  /** JSON Pointer to the field, or to the key when a record's keys are references. */
  readonly path: string;
  readonly value: string;
  readonly target: RefTarget;
}

export interface FoundCondition {
  /** JSON Pointer to the condition field. */
  readonly path: string;
  /** As written, sound or not: checkCondition says which. */
  readonly value: unknown;
}

export interface Found {
  readonly refs: FoundRef[];
  readonly conditions: FoundCondition[];
}

/**
 * Every reference and condition in `value`, found by walking the schema and the value together.
 * It reads values that fail the schema too, as far as their shape allows, so one bad field does
 * not hide the references around it. zod reports the failure itself. A condition's own
 * references are left to conditionRefs, which knows the facts' domains.
 */
export function scanRecord(schema: z.core.$ZodType, value: unknown): Found {
  const found: Found = { refs: [], conditions: [] };
  walk(schema, value, '', found);
  return found;
}

export const collectRefs = (schema: z.core.$ZodType, value: unknown): FoundRef[] => scanRecord(schema, value).refs;

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function walk(schema: z.core.$ZodType, value: unknown, path: string, found: Found): void {
  if (isConditionSchema(schema)) {
    // Undefined is a missing field, as zod reads it: zod reports it when the field is required.
    if (value !== undefined) found.conditions.push({ path, value });
    return;
  }
  const target = refTargetOf(schema);
  if (target !== undefined) {
    if (typeof value === 'string') found.refs.push({ path, value, target });
    return;
  }
  const shape = view(schema);
  const at = (key: string | number) => `${path}/${pointerSegment(key)}`;
  switch (shape.kind) {
    case 'object':
      if (!isObject(value)) break;
      for (const [key, child] of Object.entries(shape.shape)) {
        if (Object.hasOwn(value, key)) walk(child, value[key], at(key), found);
      }
      break;
    case 'record':
      if (!isObject(value)) break;
      for (const [key, child] of Object.entries(value)) {
        walk(shape.key, key, at(key), found);
        walk(shape.value, child, at(key), found);
      }
      break;
    case 'array':
      if (!Array.isArray(value)) break;
      for (const [i, item] of value.entries()) walk(shape.element, item, at(i), found);
      break;
    case 'tuple':
      if (!Array.isArray(value)) break;
      for (const [i, item] of value.entries()) {
        const itemSchema = shape.items[i] ?? shape.rest;
        if (itemSchema) walk(itemSchema, item, at(i), found);
      }
      break;
    case 'union': {
      const option = chooseOption(shape.options, shape.discriminator, value);
      if (option) walk(option, value, path, found);
      break;
    }
    case 'wrapper':
      walk(shape.inner, value, path, found);
      break;
  }
}

/**
 * The option zod accepted: the first that parses. When none does, a discriminated union still
 * knows which option the value meant, so its references are read too.
 */
function chooseOption(
  options: readonly z.core.$ZodType[],
  discriminator: string | undefined,
  value: unknown,
): z.core.$ZodType | undefined {
  const parsed = options.find((option) => z.safeParse(option, value).success);
  if (parsed || discriminator === undefined || !isObject(value) || !Object.hasOwn(value, discriminator)) return parsed;
  return options.find((option) => {
    const shape = view(option);
    const field = shape.kind === 'object' ? shape.shape[discriminator] : undefined;
    return field !== undefined && z.safeParse(field, value[discriminator]).success;
  });
}
