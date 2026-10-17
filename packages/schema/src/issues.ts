/**
 * zod's issues as diagnostics read them: JSON Pointer paths, and words for unknown and missing
 * fields. Its own module, so what reads type files at the editor's start doesn't bring all of
 * validation with it (M2.4: the record checks load with the record form).
 */
import { pointerSegment } from '@eb/core';
import { z } from 'zod';

/** A schema problem: where it is, as a JSON Pointer, and what is wrong. */
export interface SchemaIssue {
  readonly path: string;
  readonly message: string;
}

const toPointer = (path: readonly PropertyKey[]): string =>
  path.map((key) => `/${pointerSegment(String(key))}`).join('');

/**
 * zod's issues for a value, as JSON Pointer paths and messages, with a field-level entry for each
 * unknown or missing field. Records get these as E001; the compiler reuses them for project.json.
 */
export function schemaIssues(schema: z.core.$ZodType, value: unknown): SchemaIssue[] {
  const result = z.safeParse(schema, value);
  if (result.success) return [];
  return result.error.issues.flatMap((issue): SchemaIssue[] => {
    const path = toPointer(issue.path);
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({ path: `${path}/${pointerSegment(key)}`, message: `Unknown field "${key}"` }));
    }
    if (issue.code === 'invalid_type' && isMissingField(value, issue.path)) {
      return [{ path, message: `Missing field "${String(issue.path[issue.path.length - 1])}"` }];
    }
    if (issue.code === 'invalid_key') {
      return [{ path, message: `Invalid key: ${issue.issues[0]?.message ?? issue.message}` }];
    }
    return [{ path, message: issue.message }];
  });
}

function isMissingField(root: unknown, path: readonly PropertyKey[]): boolean {
  let node = root;
  for (const key of path.slice(0, -1)) {
    if (typeof node !== 'object' || node === null) return false;
    node = (node as Record<PropertyKey, unknown>)[key];
  }
  const last = path[path.length - 1];
  return (
    last !== undefined &&
    typeof node === 'object' &&
    node !== null &&
    !Array.isArray(node) &&
    !Object.hasOwn(node, last)
  );
}
