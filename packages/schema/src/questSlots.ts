/**
 * A quest's slots and jobs, checked (M3.10, D48, docs/specs/quests.md#slots): E035 for slots and
 * jobs that don't hold together, E044 for a named record that isn't there, E045 for a job in a game
 * without the time module, W127 for a slot no record can ever fill, and W128 for `{x}` in a text
 * naming no slot. The scope says which slots each field of a quest can name as `@slot` (E044).
 */
import { checkCondition, NAME_PATTERN, type RecordIndex } from '@eb/core';
import { type QuestRecord, type Slot, type Stage, stageOf } from '@eb/kits';
import type { DiagnosticCode } from './diagnostics.ts';
import { schemaIssues } from './issues.ts';
import type { Known } from './known.ts';

type Report = (code: DiagnosticCode, path: string, message: string) => void;
type Scope = Readonly<Record<string, string>>;

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The slots each field of a quest's value can name: a slot's Where and By its own and those before
 * it, which are filled first; every other field all of them. Read from the value as it stands,
 * which zod may yet refuse, so a slot without an id or a type is left out.
 */
export function slotScope(value: unknown): (path: string) => Scope {
  const slots = isObject(value) && Array.isArray(value.slots) ? value.slots : [];
  const scopes: Record<string, string>[] = [];
  const all: Record<string, string> = {};
  for (const slot of slots) {
    if (isObject(slot) && typeof slot.id === 'string' && typeof slot.type === 'string' && !(slot.id in all))
      all[slot.id] = slot.type;
    scopes.push({ ...all });
  }
  return (path) => {
    const at = /^\/slots\/(\d+)\/(where|by)(\/|$)/.exec(path);
    return at ? (scopes[Number(at[1])] ?? all) : all;
  };
}

/** `{x}` in a text: the slots it names. */
export const namedInText = (text: string): string[] => [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1] as string);

export interface SlotContext {
  readonly known: Known;
  readonly records: RecordIndex;
  /** Types records of which modules make in play: the roster's actors. */
  readonly made: ReadonlySet<string>;
}

/** Each slot's own fields, then the texts naming slots. */
export function checkSlots(quest: QuestRecord, report: Report, ctx: SlotContext): void {
  const slots = quest.slots ?? [];
  const scope = slotScope(quest);
  const seen = new Set<string>();
  slots.forEach((slot, i) => {
    const at = `/slots/${i}`;
    if (!NAME_PATTERN.test(slot.id)) {
      report('E035', `${at}/id`, `"${slot.id}" can't be written after @: use lowercase words joined by hyphens`);
    } else if (seen.has(slot.id)) report('E035', `${at}/id`, `${slot.id} is a slot twice in this quest`);
    seen.add(slot.id);
    checkSlot(quest, slot, at, report, ctx);
    if (slot.by !== undefined) checkBy(slot.by, `${at}/by`, scope(`${at}/by`), report, ctx);
  });
  checkTexts(quest, new Set(slots.map((slot) => slot.id)), report);
}

function checkSlot(quest: QuestRecord, slot: Slot, at: string, report: Report, ctx: SlotContext): void {
  if ((slot.record === undefined) === (slot.where === undefined)) {
    const which = slot.record === undefined ? 'give one' : 'not both';
    report('E035', at, `A slot holds a Record or the records matching Where: ${which}`);
  }
  const ranks = slot.pick === 'most' || slot.pick === 'least';
  if (ranks && slot.by === undefined) report('E035', `${at}/pick`, `${slot.pick} by what? Give By`);
  if (!ranks && slot.by !== undefined) report('E035', `${at}/by`, 'By ranks the records for Most or Least only');
  if (slot.gone !== undefined && stageOf(quest, slot.gone) === undefined) {
    report('E035', `${at}/gone`, `This quest has no stage ${slot.gone}`);
  }
  if (slot.gone !== undefined && slot.keeps === undefined) {
    report('E035', `${at}/gone`, 'A record is gone when Keeps while stops holding: give Keeps while');
  }
  const written = ctx.records.ids(slot.type).length > 0;
  if (slot.record !== undefined && !ctx.records.has(slot.type, slot.record)) {
    report('E044', `${at}/record`, `No ${slot.type} record "${slot.record}"`);
  } else if (!written && !ctx.made.has(slot.type)) {
    report('W127', `${at}/type`, `No ${slot.type} record is written, and nothing in this game makes one`);
  }
}

/** By is a fact whose number ranks the records: checked as `fact >= 0` would be, with the slots in its scope. */
function checkBy(by: NonNullable<Slot['by']>, at: string, slots: Scope, report: Report, ctx: SlotContext): void {
  const test = { fact: by.fact, ...(by.args ? { args: by.args } : {}), op: '>=', value: 0 };
  const issues = checkCondition(test, {
    catalog: ctx.known.facts,
    records: ctx.records,
    open: ctx.known.openFacts,
    slots,
  });
  for (const issue of issues) {
    if (issue.path === '/op' || issue.path === '/value') {
      report('E035', `${at}/fact`, `${by.fact} is not a number, so it can't rank them`);
    } else report(issue.code, `${at}${issue.path}`, issue.message);
  }
}

/** Every text a quest's journal shows: its stages' logs and whys, objectives' texts, outcomes' texts, slots' whys. */
function* texts(quest: QuestRecord): Generator<[string, string]> {
  for (const [i, slot] of (quest.slots ?? []).entries()) if (slot.why) yield [`/slots/${i}/why`, slot.why];
  for (const [i, stage] of quest.stages.entries()) {
    const at = `/stages/${i}`;
    if (stage.log) yield [`${at}/log`, stage.log];
    if (stage.why) yield [`${at}/why`, stage.why];
    for (const [j, objective] of (stage.objectives ?? []).entries())
      yield [`${at}/objectives/${j}/text`, objective.text];
    for (const [j, outcome] of (stage.job?.outcomes ?? []).entries())
      if (outcome.text) yield [`${at}/job/outcomes/${j}/text`, outcome.text];
  }
}

function checkTexts(quest: QuestRecord, slots: ReadonlySet<string>, report: Report): void {
  for (const [path, text] of texts(quest)) {
    for (const name of namedInText(text)) {
      if (!slots.has(name)) report('W128', path, `{${name}} names no slot of this quest: it shows as written`);
    }
  }
}

// The fields a stage with a job has no use for: it waits until the job is over, and goes where the outcome leads.
const UNREAD_ON_JOBS = [
  ['objectives', 'Objectives'],
  ['next', 'Then'],
  ['fails', 'Fails'],
  ['fail-when', 'Fails when'],
  ['days', 'Days'],
] as const;

/** A stage's job: its fields, its outcomes, its length in the calendar's units, and a time module to run it. */
export function checkJob(stage: Stage, at: string, stages: ReadonlySet<string>, report: Report, known: Known): void {
  const job = stage.job;
  if (job === undefined) return;
  for (const [key, label] of UNREAD_ON_JOBS) {
    if (stage[key] !== undefined)
      report('E035', `${at}/${key}`, `A stage with a job ends by its outcomes, so its ${label} is never read`);
  }
  let total = 0;
  job.outcomes.forEach((outcome, k) => {
    total += outcome.chance;
    if (!stages.has(outcome.next))
      report('E035', `${at}/job/outcomes/${k}/next`, `This quest has no stage ${outcome.next}`);
  });
  if (total !== 100) report('E035', `${at}/job/outcomes`, `Its chances add up to ${total}, not 100`);
  const schedule = known.effects.schemas.get('schedule');
  const time = known.openEvents || known.events['time/fired'] !== undefined;
  if (!time) {
    report('E045', `${at}/job`, 'A job takes time, which the time module keeps: this game has none');
  } else if (schedule) {
    // As long as a timer's: the calendar's units, at least a tick.
    for (const issue of schemaIssues(schedule, { effect: 'schedule', after: job.takes, effects: [] })) {
      const inner = issue.path.replace(/^\/after/, '');
      report('E035', `${at}/job/takes${inner}`, issue.message);
    }
  }
}

/** A timer the kit names for a quest's job, which content must leave alone. */
export const isJobTimer = (name: unknown): boolean => typeof name === 'string' && name.startsWith('quests-');
