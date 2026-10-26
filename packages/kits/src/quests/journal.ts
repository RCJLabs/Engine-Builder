/**
 * What a quest shows (docs/specs/quests.md#what-a-quest-shows): its journal entry, read from the
 * state the kit keeps, so the journal says what the sim holds. Each reached stage's log line, the
 * current stage's objectives with their counts, the days left and why it failed; M3.10's slots,
 * a job's odds and time left (never its outcome), the runs counted and a slot no record fills;
 * M6.6's targets, where each objective's marker points.
 */
import type { FactArgs } from '@eb/core';
import { own } from '../own.ts';
import { jobTable, jobTimer } from './jobs.ts';
import { questRecord, stageOf } from './records.ts';
import { bind, fillSlots, type Reader, slotName, slotText } from './slots.ts';
import { targetOf } from './targets.ts';
import type { QuestRecord, Stage, Target } from './types.ts';

export type ObjectiveShown = {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
  readonly count?: number;
  readonly to?: number;
  /** Where its marker points (M6.6), its slots bound: written, or read from its count. */
  readonly target?: Target;
};

export type JobShown = {
  readonly outcomes: readonly { readonly chance: number; readonly text?: string }[];
  /** Ticks until it is over, as time.left says. */
  readonly left?: number;
};

export type QuestShown = {
  readonly quest: string;
  readonly name: string;
  readonly state: 'waiting' | 'active' | 'done' | 'failed';
  readonly log?: readonly string[];
  readonly objectives?: readonly ObjectiveShown[];
  readonly 'days-left'?: number;
  readonly why?: string;
  readonly slots?: Readonly<Record<string, { readonly id: string; readonly name: string }>>;
  readonly job?: JobShown;
  readonly times?: { readonly done: number; readonly failed: number };
  /** A quest waiting: the first slot no record fills now, so it can't start. */
  readonly unfilled?: string;
};

function jobShown(
  reader: Reader,
  id: string,
  quest: QuestRecord,
  stage: Stage,
  slots: Record<string, string> | undefined,
) {
  const outcomes = jobTable(stage).map(({ outcome, index }) => {
    const text = stage.job?.outcomes[index]?.text;
    return {
      chance: outcome.chance,
      ...(text === undefined ? {} : { text: slotText(reader.content, quest, slots, text, reader.places) }),
    };
  });
  const left = reader.fact('time.left', { timer: jobTimer(id) } as FactArgs);
  return { outcomes, ...(typeof left === 'number' ? { left } : {}) };
}

/** The quest's journal entry, as `start-quest`'s preview gives it. */
export function questShown(reader: Reader, id: string): QuestShown {
  const quest = questRecord(reader.content, id);
  const entry = own(reader.read().quests, id);
  if (entry === undefined) {
    const fill = fillSlots(reader, quest);
    const waiting: QuestShown = { quest: id, name: quest.name, state: 'waiting' };
    return 'unfilled' in fill ? { ...waiting, unfilled: fill.unfilled } : waiting;
  }
  const slots = entry.slots as Record<string, string> | undefined;
  const text = (written: string) => slotText(reader.content, quest, slots, written, reader.places);
  const log = entry.log.flatMap((reached) => {
    const line = stageOf(quest, reached)?.log;
    return line === undefined ? [] : [text(line)];
  });
  const past = entry.times ?? { done: 0, failed: 0 };
  const shown: QuestShown = {
    quest: id,
    name: quest.name,
    state: entry.state,
    log,
    ...(slots === undefined ? {} : { slots: slotsShown(reader, quest, slots) }),
    ...(quest.repeats === true
      ? {
          times: {
            done: past.done + (entry.state === 'done' ? 1 : 0),
            failed: past.failed + (entry.state === 'failed' ? 1 : 0),
          },
        }
      : {}),
  };
  const stage = stageOf(quest, entry.stage);
  if (entry.state !== 'active' || stage === undefined) {
    return entry.why === undefined ? shown : { ...shown, why: entry.why };
  }
  const objectives = (stage.objectives ?? []).map((objective): ObjectiveShown => {
    const done = entry.done.includes(objective.id);
    const target = targetOf(objective);
    const shownObjective = {
      id: objective.id,
      text: text(objective.text),
      done,
      ...(target === undefined ? {} : { target: bind(target, slots) }),
    };
    if (objective.count === undefined) return shownObjective;
    const count = own(entry.counts, objective.id) ?? 0;
    return { ...shownObjective, count, to: objective.count.to };
  });
  return {
    ...shown,
    objectives,
    ...(stage.days === undefined ? {} : { 'days-left': Math.max(stage.days - entry.days, 0) }),
    ...(stage.job === undefined ? {} : { job: jobShown(reader, id, quest, stage, slots) }),
  };
}

const slotsShown = (reader: Reader, quest: QuestRecord, slots: Record<string, string>) =>
  Object.fromEntries(
    (quest.slots ?? []).flatMap((slot) => {
      const record = own(slots, slot.id);
      return record === undefined
        ? []
        : [[slot.id, { id: record, name: slotName(reader.content, reader.places, slot, slots) }]];
    }),
  );
