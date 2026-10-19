/**
 * What a quest shows (docs/specs/quests.md#what-a-quest-shows): its journal entry, read from the
 * state the kit keeps, so the journal says what the sim holds. Each reached stage's log line, the
 * current stage's objectives with their counts, the days left and why it failed.
 */
import type { DeepReadonly, RecordStore } from '@eb/core';
import { own } from '../own.ts';
import { questRecord, stageOf } from './records.ts';
import type { QuestsSlice } from './types.ts';

export type ObjectiveShown = {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
  readonly count?: number;
  readonly to?: number;
};

export type QuestShown = {
  readonly quest: string;
  readonly name: string;
  readonly state: 'waiting' | 'active' | 'done' | 'failed';
  readonly log?: readonly string[];
  readonly objectives?: readonly ObjectiveShown[];
  readonly 'days-left'?: number;
  readonly why?: string;
};

/** The quest's journal entry, as `start-quest`'s preview gives it. */
export function questShown(content: RecordStore, slice: DeepReadonly<QuestsSlice>, id: string): QuestShown {
  const quest = questRecord(content, id);
  const entry = own(slice.quests, id);
  if (entry === undefined) return { quest: id, name: quest.name, state: 'waiting' };
  const log = entry.log.flatMap((reached) => {
    const line = stageOf(quest, reached)?.log;
    return line === undefined ? [] : [line];
  });
  const shown: QuestShown = { quest: id, name: quest.name, state: entry.state, log };
  const stage = stageOf(quest, entry.stage);
  if (entry.state !== 'active' || stage === undefined) {
    return entry.why === undefined ? shown : { ...shown, why: entry.why };
  }
  const objectives = (stage.objectives ?? []).map((objective): ObjectiveShown => {
    const done = entry.done.includes(objective.id);
    if (objective.count === undefined) return { id: objective.id, text: objective.text, done };
    const count = own(entry.counts, objective.id) ?? 0;
    return { id: objective.id, text: objective.text, done, count, to: objective.count.to };
  });
  return {
    ...shown,
    objectives,
    ...(stage.days === undefined ? {} : { 'days-left': Math.max(stage.days - entry.days, 0) }),
  };
}
