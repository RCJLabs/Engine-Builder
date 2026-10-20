/**
 * A game's shell checked (M4.3, D53, docs/specs/shell.md#checks): its shape (E047), and that its
 * slot line reads only facts the game has (E048), filled by the worker as each save is made.
 */
import { type ShellFile, splitTemplate } from '@eb/ui/format';
import { type Diagnostic, type DiagnosticCode, severityOf } from './diagnostics.ts';
import { schemaIssues } from './issues.ts';
import { checkBinding } from './templateCheck.ts';
import type { UiCheckOptions } from './uiCheck.ts';
import { shellSchema } from './uiSchema.ts';

export function checkShell(file: string, value: unknown, options: UiCheckOptions): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const report = (code: DiagnosticCode, path: string, message: string) =>
    diagnostics.push({ code, severity: severityOf(code), message, file, path });
  const issues = schemaIssues(shellSchema, value);
  for (const issue of issues) report('E047', issue.path, issue.message);
  const line = issues.length === 0 ? (value as ShellFile)['slot-line'] : undefined;
  if (line === undefined) return diagnostics;
  const split = splitTemplate(line);
  if (!split.ok) report('E047', '/slot-line', split.message);
  for (const segment of split.ok ? split.segments : []) {
    if (segment.kind === 'fact')
      checkBinding(segment.text, options, (message) => report('E048', '/slot-line', message));
    // A slot is listed before its game is open, so its line has only the game's facts to read.
    else if (segment.kind !== 'text') {
      const name = segment.kind === 'view' ? segment.name : `.${segment.name}`;
      report('E048', '/slot-line', `{${name}}: a slot's line reads the game's facts, not a talk, event, shop or entry`);
    }
  }
  return diagnostics;
}
