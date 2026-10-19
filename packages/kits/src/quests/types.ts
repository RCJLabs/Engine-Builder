/**
 * The quests kit's records and state (M3.9, D47, docs/specs/quests.md): quests of stages whose
 * objectives check themselves, and for each quest started, where it is, what it has logged and
 * what of its stage is done. A quest not yet started has no entry.
 */
import type { Condition, Effect } from '@eb/core';

/** The kit's id, its module's id and the key of its slice. */
export const QUESTS = 'quests';
export const QUEST = 'quest';

/** A count objective: done once the event, with these argument values, is heard `to` times. */
export interface Count {
  readonly event: string;
  readonly args?: Readonly<Record<string, unknown>>;
  readonly to: number;
}

export interface Objective {
  /** Lowercase words joined by hyphens, once in the quest. */
  readonly id: string;
  /** What the journal shows. */
  readonly text: string;
  readonly 'done-when'?: Condition;
  readonly count?: Count;
  /** Once done, the quest goes to this stage at once (Leads to). */
  readonly next?: string;
}

export interface Stage {
  /** Lowercase words joined by hyphens, once in the quest. */
  readonly id: string;
  /** The journal's line for it, added as it is reached. */
  readonly log?: string;
  readonly effects?: readonly Effect[];
  readonly objectives?: readonly Objective[];
  /** Where the quest goes once its objectives are done (Then); done when there is none. */
  readonly next?: string;
  /** Reaching it ends the quest, failed, its log the reason. */
  readonly fails?: boolean;
  readonly 'fail-when'?: Condition;
  /** Days that may start while it is current before the quest fails. */
  readonly days?: number;
  /** What the journal says when it fails by fail-when or days. */
  readonly why?: string;
}

/** records/quest/<id>.json. */
export interface QuestRecord {
  readonly name: string;
  readonly 'at-start'?: boolean;
  readonly 'starts-when'?: Condition;
  /** At least one; the first is where it starts. */
  readonly stages: readonly Stage[];
}

export type QuestState = 'active' | 'done' | 'failed';
/** A quest's state as facts and the journal say it: waiting until it starts. */
export const QUEST_STATES = ['waiting', 'active', 'done', 'failed'] as const;

/** One quest started, as a handler writes it. */
export interface QuestEntry {
  state: QuestState;
  /** The stage it is at, or ended at. */
  stage: string;
  /** The stages reached, in order: one reached twice is here twice. */
  log: string[];
  /** The current stage's objectives done, sorted. */
  done: string[];
  /** The current stage's count objectives' counts. */
  counts: Record<string, number>;
  /** Days started while the current stage has been current. */
  days: number;
  /** Why it failed, once it has. */
  why?: string;
}

/** The kit's slice: each quest started, by id. */
export interface QuestsSlice {
  quests: Record<string, QuestEntry>;
}
