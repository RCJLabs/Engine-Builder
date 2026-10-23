/**
 * Each quest and why it hasn't moved on (M4.9, docs/specs/play-in-editor.md#quests), read in the
 * worker from the state, the records and the game's own check: the journal entry `start-quest`
 * previews, with the conditions it doesn't show. Dirtbag's and Landnam's "why it's blocked"
 * functions answer the same question by hand, one screen at a time.
 */
import { type Condition, describeCondition, type FactCatalog, type Truth } from '@eb/core';

/** A quest as the quests kit's journal shows it: the fields this reads. */
interface Shown {
  readonly name: string;
  readonly state: 'waiting' | 'active' | 'done' | 'failed';
  readonly objectives?: readonly {
    readonly id: string;
    readonly text: string;
    readonly done: boolean;
    readonly count?: number;
    readonly to?: number;
  }[];
  readonly 'days-left'?: number;
  readonly why?: string;
  readonly job?: { readonly left?: number };
  readonly unfilled?: string;
}

/** The record's fields this reads. */
interface QuestFields {
  readonly 'at-start'?: boolean;
  readonly 'starts-when'?: Condition;
  readonly stages: readonly {
    readonly id: string;
    readonly 'fail-when'?: Condition;
    readonly objectives?: readonly { readonly id: string; readonly 'done-when'?: Condition }[];
  }[];
}

/** One thing standing in a quest's way, or done: `holds` is the condition's truth now, if it has one. */
export interface WhyLine {
  readonly text: string;
  readonly holds?: Truth;
}

export interface QuestWhy {
  readonly quest: string;
  readonly name: string;
  readonly state: Shown['state'];
  /** The stage it is at, or ended at. */
  readonly stage: string | undefined;
  /** Its stages, in order: what Set stage offers. */
  readonly stages: readonly string[];
  readonly why: readonly WhyLine[];
}

/** What the worker reads a quest with: its journal entry, its stage, its record, and the game's check. */
export interface QuestReader {
  readonly catalog: FactCatalog;
  shown(quest: string): unknown;
  stage(quest: string): string | undefined;
  record(quest: string): unknown;
  check(condition: Condition): Truth;
}

// In the middle of a line: describeCondition capitalises its first letter, and only that.
const said = (condition: Condition, reader: QuestReader) => {
  const text = describeCondition(condition, reader.catalog);
  return text.charAt(0).toLowerCase() + text.slice(1);
};

/** A condition's truth; unknown where it names a slot only the kit can fill (M3.10). */
function truth(condition: Condition, reader: QuestReader): Truth {
  try {
    return reader.check(condition);
  } catch {
    return null;
  }
}

export function questWhy(reader: QuestReader, quest: string): QuestWhy {
  const shown = reader.shown(quest) as Shown;
  const record = reader.record(quest) as QuestFields;
  const stage = reader.stage(quest);
  const base = { quest, name: shown.name, state: shown.state, stage, stages: record.stages.map((s) => s.id) };
  return { ...base, why: whyLines(reader, shown, record, stage) };
}

function whyLines(reader: QuestReader, shown: Shown, record: QuestFields, stage: string | undefined): WhyLine[] {
  if (shown.state === 'done') return [{ text: `Done, at ${stage ?? 'its last stage'}` }];
  if (shown.state === 'failed') return [{ text: `Failed: ${shown.why ?? 'no reason given'}` }];
  if (shown.state === 'waiting') return waiting(reader, shown, record);
  const current = record.stages.find((s) => s.id === stage);
  const lines: WhyLine[] = (shown.objectives ?? []).map((objective) => {
    if (objective.done) return { text: `${objective.text}: done`, holds: true };
    if (objective.to !== undefined) return { text: `${objective.text}: ${objective.count ?? 0} of ${objective.to}` };
    const when = current?.objectives?.find((o) => o.id === objective.id)?.['done-when'];
    if (when === undefined) return { text: `${objective.text}: not done` };
    return { text: `${objective.text}: when ${said(when, reader)}`, holds: truth(when, reader) };
  });
  if (shown['days-left'] !== undefined) lines.push({ text: `${shown['days-left']} days left before it fails` });
  if (shown.job) lines.push({ text: `A job under way: ${shown.job.left ?? 'no'} ticks left` });
  const failWhen = current?.['fail-when'];
  if (failWhen) lines.push({ text: `Fails when ${said(failWhen, reader)}`, holds: truth(failWhen, reader) });
  if (lines.length === 0) lines.push({ text: 'Nothing to do at this stage: it moves on as its stage says' });
  return lines;
}

function waiting(reader: QuestReader, shown: Shown, record: QuestFields): WhyLine[] {
  if (shown.unfilled !== undefined) return [{ text: `No record fills its slot ${shown.unfilled}` }];
  const when = record['starts-when'];
  if (when) return [{ text: `Starts when ${said(when, reader)}`, holds: truth(when, reader) }];
  if (record['at-start']) return [{ text: 'Starts as the game starts' }];
  return [{ text: 'Starts only when an effect starts it' }];
}
