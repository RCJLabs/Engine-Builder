/**
 * A game's feedback checked (M4.2, D52, docs/specs/input.md#checks): its shape (E047), the event each
 * line is on (E051), the arguments it matches and fills in (E052), and that its words read nothing
 * else (E048). A game's events are known only once its scripts have run: without them, only the
 * shape and the templates' braces are checked, as a button's take is without actions.
 */
import { domainProblem, type EventCatalog, pointerSegment, type RecordIndex } from '@eb/core';
import { type Feedback, type FeedbackLine, SOUND, splitTemplate } from '@eb/ui/format';
import { type Diagnostic, type DiagnosticCode, severityOf } from './diagnostics.ts';
import { schemaIssues } from './issues.ts';
import { missingRecord } from './missingRecord.ts';
import { feedbackSchema } from './uiSchema.ts';

/** The feedback file's problems, in no order: checkUi sorts them with the screens'. */
export function checkFeedback(
  file: string,
  value: unknown,
  events: EventCatalog | undefined,
  records: RecordIndex | undefined,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const report = (code: DiagnosticCode, path: string, message: string) =>
    diagnostics.push({ code, severity: severityOf(code), message, file, path });
  const issues = schemaIssues(feedbackSchema, value);
  for (const issue of issues) report('E047', issue.path, issue.message);
  if (issues.length > 0) return diagnostics;
  for (const [i, line] of (value as Feedback).lines.entries()) {
    checkLine(line, events, records, (code, path, message) => report(code, `/lines/${i}${path}`, message));
  }
  return diagnostics;
}

function checkLine(
  line: FeedbackLine,
  events: EventCatalog | undefined,
  records: RecordIndex | undefined,
  report: (code: DiagnosticCode, path: string, message: string) => void,
): void {
  const known = events === undefined ? undefined : Object.hasOwn(events, line.on) ? events[line.on] : null;
  if (known === null) report('E051', '/on', `The game declares no event "${line.on}"`);
  const args = known?.args ?? {};
  const lacks = (name: string) => {
    const has = Object.keys(args);
    return `"${line.on}" has no argument "${name}": ${has.length > 0 ? `it has ${has.join(', ')}` : 'it has none'}`;
  };
  for (const [name, wanted] of Object.entries(line.where ?? {})) {
    if (!known) continue;
    const domain = Object.hasOwn(args, name) ? args[name] : undefined;
    const problem = domain === undefined ? lacks(name) : domainProblem(wanted, domain, records);
    if (problem) report('E052', `/where/${pointerSegment(name)}`, problem);
  }
  const sound = missingRecord(records, SOUND, line.sound);
  if (sound) report('E049', '/sound', sound);
  if (line.say === undefined) return;
  const split = splitTemplate(line.say);
  if (!split.ok) {
    report('E047', '/say', split.message);
    return;
  }
  for (const segment of split.segments) {
    if (segment.kind === 'fact' || segment.kind === 'view') {
      const name = segment.kind === 'fact' ? segment.text : segment.name;
      report('E048', '/say', `{${name}}: a feedback line reads only its event’s arguments, as {.item}`);
    } else if (segment.kind === 'field' && known && !Object.hasOwn(args, segment.name)) {
      report('E052', '/say', `{.${segment.name}}: ${lacks(segment.name)}`);
    }
  }
}
