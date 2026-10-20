/**
 * What a template and a shows-when read (docs/specs/screens.md#checks): a template's facts and
 * view fields and an item's entry fields (E048, E049), a shows-when as a condition (E048). Shared
 * by the screens' checks and the shell's slot line (M4.3). A codex's item may name its entry's
 * record as `@entry`, and its `unknown` shows nothing of it (M4.4).
 */
import { checkCondition, parseCondition } from '@eb/core';
import { ENTRY_SLOT, namesEntry, SOURCE_FIELDS, type Source, splitTemplate, VIEW_FIELDS } from '@eb/ui/format';
import type { DiagnosticCode } from './diagnostics.ts';
import type { UiCheckOptions } from './uiCheck.ts';

/** Where a template or shows-when sits. */
export interface Scope {
  /** The list whose item it is in, if any. */
  readonly list?: Source;
  /** In a `records` list's item or its `known`: the record type `@entry` holds. */
  readonly codex?: string;
  /** In a `records` list's `unknown`, which shows nothing of the entry held back. */
  readonly held?: boolean;
  /**
   * In a `records` list whose type is missing or not the project's: the list's own E049 says so,
   * so what `@entry` names here goes unchecked rather than failing twice.
   */
  readonly untyped?: boolean;
}

const HELD = 'An entry not yet known shows nothing of its record';

/** Why `@entry` can't be named here, or undefined where it can or isn't. */
function entryProblem(text: string, scope: Scope): string | undefined {
  if (!namesEntry(text)) return undefined;
  if (scope.held) return `${HELD}: @entry is out of reach here`;
  if (scope.codex === undefined)
    return '@entry is a codex entry’s record: only a records list’s item and known name it';
  return undefined;
}

const conditionOptions = (options: UiCheckOptions, scope: Scope) => ({
  catalog: options.facts,
  open: options.openFacts,
  ...(options.records ? { records: options.records } : {}),
  ...(scope.codex !== undefined ? { slots: { [ENTRY_SLOT]: scope.codex } } : {}),
});

/** A shows-when, or a codex's known: a condition in the text form, checked as a record's is. */
export function checkWhen(
  text: string,
  options: UiCheckOptions,
  report: (message: string) => void,
  scope: Scope = {},
): void {
  if (scope.untyped && namesEntry(text)) return;
  const problem = entryProblem(text, scope);
  if (problem !== undefined) {
    report(problem);
    return;
  }
  const parsed = parseCondition(text, options.facts);
  if (!parsed.ok) {
    report(parsed.message);
    return;
  }
  for (const issue of checkCondition(parsed.condition, conditionOptions(options, scope))) report(issue.message);
}

/** The fields an entry of the scope's list has: for a codex's, its record's too, or any when its type's aren't known. */
function fieldsOf(list: Source, scope: Scope, options: UiCheckOptions): readonly string[] | undefined {
  if (list !== 'records') return SOURCE_FIELDS[list];
  const own = scope.codex === undefined ? undefined : options.recordFields?.[scope.codex];
  return own === undefined || own === null ? undefined : [...new Set([...SOURCE_FIELDS.records, ...own])];
}

export function checkTemplate(
  template: string,
  scope: Scope,
  options: UiCheckOptions,
  report: (code: DiagnosticCode, message: string) => void,
): void {
  const split = splitTemplate(template);
  if (!split.ok) {
    report('E047', split.message);
    return;
  }
  for (const segment of split.segments) {
    if (segment.kind === 'fact') checkBinding(segment.text, options, (message) => report('E048', message), scope);
    if (segment.kind === 'view') {
      const kit = VIEW_FIELDS[segment.name] as string;
      if (!options.kits.includes(kit))
        report('E049', `{${segment.name}} needs the ${kit} kit: turn it on in project.json`);
    }
    if (segment.kind === 'field') checkField(segment.name, scope, options, (message) => report('E048', message));
  }
}

function checkField(name: string, scope: Scope, options: UiCheckOptions, report: (message: string) => void): void {
  if (scope.held) {
    report(`${HELD}: {.${name}} is out of reach here`);
    return;
  }
  if (scope.list === undefined) {
    report(`{.${name}} is an entry’s field: only a list’s item has one`);
    return;
  }
  const fields = fieldsOf(scope.list, scope, options);
  if (fields !== undefined && !fields.includes(name)) {
    const whose = scope.list === 'records' ? `The ${scope.codex} type` : `A ${scope.list} entry`;
    report(`${whose} has no field "${name}": ${fields.join(', ')}`);
  }
}

/** A fact in braces: one fact, its arguments named, shown as its value, so it compares with nothing. */
export function checkBinding(
  text: string,
  options: UiCheckOptions,
  report: (message: string) => void,
  scope: Scope = {},
): void {
  if (scope.untyped && namesEntry(text)) return;
  const problem = entryProblem(text, scope);
  if (problem !== undefined) {
    report(`{${text}}: ${problem}`);
    return;
  }
  const parsed = parseCondition(text, options.facts);
  if (!parsed.ok) {
    report(`{${text}}: ${parsed.message}`);
    return;
  }
  const test = parsed.condition;
  if (!('fact' in test) || test.op !== undefined) {
    report(`{${text}} shows one fact’s value: a comparison goes in shows-when`);
    return;
  }
  // E014 here is only "not a yes/no fact", which a value shown needn't be.
  for (const issue of checkCondition(test, conditionOptions(options, scope))) {
    if (issue.code !== 'E014') report(`{${text}}: ${issue.message}`);
  }
}
