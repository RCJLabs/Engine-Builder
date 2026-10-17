import type { CompileResult } from '@eb/compiler';
import type { Diagnostic } from '@eb/schema';

/** `file#/json/pointer: severity code: message`, the pointer written as a URI fragment (RFC 6901). */
export const formatDiagnostic = (d: Diagnostic): string =>
  `${d.file ?? '(project)'}${d.path === '' ? '' : `#${d.path}`}: ${d.severity} ${d.code}: ${d.message}`;

const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The lines a person reads: each diagnostic, then one summary line. */
export function formatResult(result: CompileResult, noTypes: boolean): string[] {
  const lines = result.diagnostics.map(formatDiagnostic);
  const errors = result.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = result.diagnostics.length - errors;
  // Since M2.4 a project's own types/ may cover every record, so the hint waits for records of a type nobody defined.
  if (noTypes && result.diagnostics.some((d) => d.code === 'E002')) {
    lines.push(
      'Some records are of types neither types/ nor a --types module defines. Pass --types <module>, or add types/<type>.json.',
    );
  }
  const problems =
    result.diagnostics.length === 0
      ? 'no problems'
      : [errors && count(errors, 'error'), warnings && count(warnings, 'warning')].filter(Boolean).join(', ');
  const hash = result.pack ? `, hash ${result.pack.hash}` : '';
  lines.push(`${count(result.records, 'record')}: ${problems}${hash}.`);
  return lines;
}
