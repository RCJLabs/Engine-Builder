/** The quests kit's records, read by id: validation stops content naming one that isn't there (E005, E035, E043). */
import type { RecordStore } from '@eb/core';
import { type Objective, QUEST, type QuestRecord, type Slot, type Stage } from './types.ts';

export function questRecord(content: RecordStore, id: unknown): QuestRecord {
  if (typeof id !== 'string' || !content.has(QUEST, id)) throw new Error(`No quest "${String(id)}"`);
  return content.get(QUEST, id) as QuestRecord;
}

/** The quest's stage of that id, or undefined: the first so named, as E035 allows only one. */
export const stageOf = (quest: QuestRecord, id: unknown): Stage | undefined =>
  quest.stages.find((stage) => stage.id === id);

/** The quest's objective of that id, in whichever stage it is: objective ids are once in a quest (E035). */
export function objectiveOf(quest: QuestRecord, id: unknown): Objective | undefined {
  for (const stage of quest.stages) {
    const objective = stage.objectives?.find((each) => each.id === id);
    if (objective) return objective;
  }
  return undefined;
}

/** The stage, or a thrown error: E043 stops content naming one its quest doesn't have. */
export function namedStage(content: RecordStore, quest: unknown, id: unknown): Stage {
  const stage = stageOf(questRecord(content, quest), id);
  if (!stage) throw new Error(`The quest "${String(quest)}" has no stage "${String(id)}"`);
  return stage;
}

/** The objective, or a thrown error: E043 stops a condition naming one its quest doesn't have. */
export function namedObjective(content: RecordStore, quest: unknown, id: unknown): Objective {
  const objective = objectiveOf(questRecord(content, quest), id);
  if (!objective) throw new Error(`The quest "${String(quest)}" has no objective "${String(id)}"`);
  return objective;
}

/** The slot, or a thrown error: E044 stops a condition naming one its quest doesn't have. */
export function namedSlot(content: RecordStore, quest: unknown, id: unknown): Slot {
  const slot = questRecord(content, quest).slots?.find((each) => each.id === id);
  if (!slot) throw new Error(`The quest "${String(quest)}" has no slot "${String(id)}"`);
  return slot;
}
