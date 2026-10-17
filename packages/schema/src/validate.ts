import { formatRef, isRecordId, parseRef, pointerSegment } from '@eb/core';
import { z } from 'zod';
import { compareDiagnostics, compareText, type Diagnostic, type DiagnosticCode, severityOf } from './diagnostics.ts';
import type { RecordType } from './recordType.ts';
import { collectRefs, type FoundRef } from './walk.ts';

export interface RecordInput {
  readonly type: string;
  /** From the record's file name (M1.4); the record's JSON does not repeat it. */
  readonly id: string;
  readonly file?: string;
  readonly value: unknown;
  /**
   * The file could not be read, and the compiler has said why. The record still exists, so
   * references to it resolve, but its value is not checked.
   */
  readonly unreadable?: boolean;
}

/** One place that references a record. */
export interface Usage {
  /** The referencing record, as "type:id". */
  readonly from: string;
  readonly file?: string;
  readonly path: string;
}

export interface Validation {
  /** Sorted by compareDiagnostics. */
  readonly diagnostics: readonly Diagnostic[];
  /**
   * Every "type:id" that something references, sorted, with its usages sorted by from, path
   * and file. It includes references that fail E005 or E006, so the editor can show what still
   * points at a deleted record.
   */
  readonly usedBy: ReadonlyMap<string, readonly Usage[]>;
}

/**
 * Checks records against their types and against each other. The result depends only on the
 * set of records given, never on their order.
 */
export function validateRecords(types: readonly RecordType[], records: readonly RecordInput[]): Validation {
  const byName = indexTypes(types);
  // Records of unknown types count too; no reference can name them, since every reference
  // target is a known type.
  const counts = new Map<string, number>();
  for (const { type, id } of records) counts.set(formatRef(type, id), (counts.get(formatRef(type, id)) ?? 0) + 1);
  const diagnostics: Diagnostic[] = [];
  const usages = new Map<string, Usage[]>();
  for (const record of records) {
    const report = (code: DiagnosticCode, path: string, message: string) =>
      diagnostics.push(diagnostic(record, code, path, message));
    const recordType = byName.get(record.type);
    if (!recordType) {
      report('E002', '', `Unknown record type "${record.type}"`);
      continue;
    }
    if (!isRecordId(record.id)) {
      report(
        'E003',
        '',
        `"${record.id}" is not a valid id: use lowercase words joined by hyphens, at most 64 characters`,
      );
    }
    const count = counts.get(formatRef(record.type, record.id)) ?? 0;
    if (count > 1) report('E004', '', `${count} ${record.type} records have the id "${record.id}"`);
    if (record.unreadable) continue;
    for (const issue of schemaIssues(recordType.schema, record.value)) report('E001', issue.path, issue.message);
    for (const found of collectRefs(recordType.schema, record.value)) {
      const key = resolve(found, report);
      if (key === undefined) continue;
      const list = usages.get(key) ?? [];
      list.push(usage(record, found.path));
      usages.set(key, list);
      if (!counts.has(key)) report('E005', found.path, `No record ${key}`);
    }
  }
  return { diagnostics: diagnostics.sort(compareDiagnostics), usedBy: sortUsages(usages) };
}

/** Throws on programmer errors: two types with one name, or a reference to a type nobody defined. */
function indexTypes(types: readonly RecordType[]): ReadonlyMap<string, RecordType> {
  const byName = new Map<string, RecordType>();
  for (const recordType of types) {
    if (byName.has(recordType.type)) throw new Error(`Two record types are named "${recordType.type}"`);
    byName.set(recordType.type, recordType);
  }
  for (const recordType of types) {
    for (const target of recordType.targets) {
      if (!byName.has(target)) throw new Error(`Record type "${recordType.type}" references unknown type "${target}"`);
    }
  }
  return byName;
}

/**
 * The "type:id" a reference names, or undefined when there is nothing to resolve: a malformed
 * value (zod reports it as E001) or a type the field does not allow (reported here, as E006).
 */
function resolve(found: FoundRef, report: (code: DiagnosticCode, path: string, message: string) => void) {
  if (typeof found.target === 'string') {
    return isRecordId(found.value) ? formatRef(found.target, found.value) : undefined;
  }
  const key = parseRef(found.value);
  if (!key) return undefined;
  if (!found.target.includes(key.type)) {
    report('E006', found.path, `This field takes ${listTypes(found.target)} records, not ${key.type}`);
    return undefined;
  }
  return found.value;
}

const listTypes = (types: readonly string[]): string =>
  types.length === 1 ? (types[0] as string) : `${types.slice(0, -1).join(', ')} or ${types[types.length - 1]}`;

function diagnostic(record: RecordInput, code: DiagnosticCode, path: string, message: string): Diagnostic {
  const { type, id, file } = record;
  return { code, severity: severityOf(code), message, type, id, ...(file === undefined ? {} : { file }), path };
}

function usage(record: RecordInput, path: string): Usage {
  const from = formatRef(record.type, record.id);
  return record.file === undefined ? { from, path } : { from, file: record.file, path };
}

function sortUsages(usages: ReadonlyMap<string, Usage[]>): ReadonlyMap<string, readonly Usage[]> {
  const byUsage = (a: Usage, b: Usage) =>
    compareText(a.from, b.from) || compareText(a.path, b.path) || compareText(a.file ?? '', b.file ?? '');
  const keys = [...usages.keys()].sort(compareText);
  return new Map(keys.map((key) => [key, Object.freeze([...(usages.get(key) ?? [])].sort(byUsage))]));
}

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
