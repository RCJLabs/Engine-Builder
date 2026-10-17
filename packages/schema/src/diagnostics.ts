/**
 * Diagnostic codes are a public contract, like save keys: the editor, the CLI and people's notes
 * refer to them. A code is never renumbered or reused; a retired code stays here, marked retired.
 * Errors are E0xx and stop a build. Warnings are W1xx and don't.
 */
export const DIAGNOSTIC_CODES = {
  E001: "The record doesn't match its type's schema",
  E002: 'Unknown record type',
  E003: 'Invalid record id',
  E004: 'Duplicate record id within a type',
  E005: 'Reference to a record that does not exist',
  E006: 'Reference to a type this field does not allow',
  E007: 'A file is not valid UTF-8 JSON',
  E008: "project.json is missing or doesn't match the project schema",
  E009: 'The project needs a newer engine',
  E010: 'A JSON file under records/ is not at records/<type>/<id>.json',
  W101: 'A file under records/ that the compiler ignores',
} as const;

export type DiagnosticCode = keyof typeof DIAGNOSTIC_CODES;
export type Severity = 'error' | 'warning';

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: Severity;
  /** For people. The code and path are the stable part; wording may improve. */
  readonly message: string;
  /** The record's type and id, when the diagnostic is about a record. */
  readonly type?: string;
  readonly id?: string;
  /** The file, relative to the project root with `/` between folders. */
  readonly file?: string;
  /** JSON Pointer (RFC 6901) into the file's JSON (a record's value); empty for the file as a whole. */
  readonly path: string;
}

export const severityOf = (code: DiagnosticCode): Severity => (code.startsWith('W') ? 'warning' : 'error');

// UTF-16 order, the same in every locale.
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** File, then type, id, path, code and message: one order whatever order the files came in. */
export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    compareText(a.file ?? '', b.file ?? '') ||
    compareText(a.type ?? '', b.type ?? '') ||
    compareText(a.id ?? '', b.id ?? '') ||
    compareText(a.path, b.path) ||
    compareText(a.code, b.code) ||
    compareText(a.message, b.message)
  );
}
