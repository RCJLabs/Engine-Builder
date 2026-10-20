/**
 * What a template and a shows-when read (docs/specs/screens.md#checks): a template's facts and
 * view fields and an item's entry fields (E048, E049), a shows-when as a condition (E048). Shared
 * by the screens' checks and the shell's slot line (M4.3).
 */
import { checkCondition, parseCondition } from '@eb/core';
import { SOURCE_FIELDS, type Source, splitTemplate, VIEW_FIELDS } from '@eb/ui/format';
import type { DiagnosticCode } from './diagnostics.ts';
import type { UiCheckOptions } from './uiCheck.ts';

/** A shows-when: a condition in the text form, checked as a record's is. */
export function checkWhen(text: string, options: UiCheckOptions, report: (message: string) => void): void {
  const parsed = parseCondition(text, options.facts);
  if (!parsed.ok) {
    report(parsed.message);
    return;
  }
  const check = {
    catalog: options.facts,
    open: options.openFacts,
    ...(options.records ? { records: options.records } : {}),
  };
  for (const issue of checkCondition(parsed.condition, check)) report(issue.message);
}

export function checkTemplate(
  template: string,
  list: Source | undefined,
  options: UiCheckOptions,
  report: (code: DiagnosticCode, message: string) => void,
): void {
  const split = splitTemplate(template);
  if (!split.ok) {
    report('E047', split.message);
    return;
  }
  for (const segment of split.segments) {
    if (segment.kind === 'fact') checkBinding(segment.text, options, (message) => report('E048', message));
    if (segment.kind === 'view') {
      const kit = VIEW_FIELDS[segment.name] as string;
      if (!options.kits.includes(kit))
        report('E049', `{${segment.name}} needs the ${kit} kit: turn it on in project.json`);
    }
    if (segment.kind === 'field') {
      if (list === undefined) report('E048', `{.${segment.name}} is an entry’s field: only a list’s item has one`);
      else if (!SOURCE_FIELDS[list].includes(segment.name)) {
        report('E048', `A ${list} entry has no field "${segment.name}": ${SOURCE_FIELDS[list].join(', ')}`);
      }
    }
  }
}

/** A fact in braces: one fact, its arguments named, shown as its value, so it compares with nothing. */
export function checkBinding(text: string, options: UiCheckOptions, report: (message: string) => void): void {
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
  const check = {
    catalog: options.facts,
    open: options.openFacts,
    ...(options.records ? { records: options.records } : {}),
  };
  // E014 here is only "not a yes/no fact", which a value shown needn't be.
  for (const issue of checkCondition(test, check)) if (issue.code !== 'E014') report(`{${text}}: ${issue.message}`);
}
