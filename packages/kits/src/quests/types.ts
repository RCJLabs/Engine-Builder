/**
 * The quests kit's records and state (M3.9, D47, docs/specs/quests.md): quests of stages whose
 * objectives check themselves, and for each quest started, where it is, what it has logged and
 * what of its stage is done. A quest not yet started has no entry.
 */
import type { Condition, Effect, ModuleContext, WorldPlaces } from '@eb/core';

/** The kit's id, its module's id and the key of its slice. */
export const QUESTS = 'quests';
export const QUEST = 'quest';

/** What the kit's handlers reach: the kernel's context, with the pack's places since M6.7 (D79). */
export type QuestsContext = ModuleContext<QuestsSlice> & { readonly places?: WorldPlaces };

/** A count objective: done once the event, with these argument values, is heard `to` times. */
export interface Count {
  readonly event: string;
  readonly args?: Readonly<Record<string, unknown>>;
  readonly to: number;
}

/**
 * Where an objective's marker points (M6.6, D78, docs/specs/markers.md#targets): an actor, by id or
 * `@slot`; or a space and, in it, an object by its path; or a space alone.
 */
export type Target = { readonly actor: string } | { readonly space: string; readonly object?: string };

export interface Objective {
  /** Lowercase words joined by hyphens, once in the quest. */
  readonly id: string;
  /** What the journal shows. */
  readonly text: string;
  readonly 'done-when'?: Condition;
  readonly count?: Count;
  /** Once done, the quest goes to this stage at once (Leads to). */
  readonly next?: string;
  /** Where its marker points (M6.6); read from its count when left out. */
  readonly target?: Target;
}

/** One way a job can end: its chance in whole percents, and the stage it leads to. */
export interface JobOutcome {
  readonly chance: number;
  readonly text?: string;
  readonly next: string;
}

/** A stage's timed job (M3.10): how long it takes, in the calendar's units, and how it can end. */
export interface Job {
  readonly takes: Readonly<Record<string, number>>;
  readonly outcomes: readonly JobOutcome[];
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
  readonly job?: Job;
}

/**
 * How a slot picks among the records that match: the first by id, at random, or by a fact's number;
 * since M6.7 (D79), for a slot that finds in the world, the nearest by doors.
 */
export const PICKS = ['first', 'random', 'most', 'least', 'nearest'] as const;
export type Pick = (typeof PICKS)[number];

/** The fact whose number ranks the records a slot could hold: `stats.value` with `actor: @man`. */
export interface SlotRank {
  readonly fact: string;
  readonly args?: Readonly<Record<string, unknown>>;
}

/** A record the quest picks as it starts (M3.10, D48), named `@id` in its fields. */
export interface Slot {
  /** Lowercase words joined by hyphens, once in the quest. */
  readonly id: string;
  /** The type of record it holds; or since M6.7 (D79) `space` or `object`, found in the world. */
  readonly type: string;
  /** The one record it holds; or `where`, which each record of the type is tried against. */
  readonly record?: string;
  readonly where?: Condition;
  /** M6.7: for an object or an actor, the space it is found in: an id, or `@slot` of an earlier space slot. */
  readonly in?: string;
  /** M6.7: the tags a match carries, every one of them. */
  readonly tags?: readonly string[];
  readonly pick?: Pick;
  readonly by?: SlotRank;
  /** The record is sent: away until the quest ends. */
  readonly goes?: boolean;
  /** While the quest is active, the slot keeps its record only while this holds. */
  readonly keeps?: Condition;
  /** The stage the quest goes to when the record is gone; it fails when there is none. */
  readonly gone?: string;
  /** What the journal says when it fails because the record is gone. */
  readonly why?: string;
}

/** records/quest/<id>.json. */
export interface QuestRecord {
  readonly name: string;
  readonly 'at-start'?: boolean;
  readonly 'starts-when'?: Condition;
  /** It can run again once it has ended (M3.10). */
  readonly repeats?: boolean;
  /** Filled in order as it starts. */
  readonly slots?: readonly Slot[];
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
  /** The stages reached, each once, in the order last reached. */
  log: string[];
  /** The current stage's objectives done, sorted. */
  done: string[];
  /** The current stage's count objectives' counts. */
  counts: Record<string, number>;
  /** Days started while the current stage has been current. */
  days: number;
  /** Why it failed, once it has. */
  why?: string;
  /** Each slot's record, by the slot's id (M3.10). None for a quest with no slots. */
  slots?: Record<string, string>;
  /** The slots whose records have gone this run, sorted: each is gone once. */
  lost?: string[];
  /** A quest that repeats: its runs before this one, done and failed. None before it has repeated. */
  times?: { done: number; failed: number };
  /** A quest that repeats and has ended: its starts-when has stopped holding, so it can start it again. */
  again?: boolean;
}

/** The kit's slice: each quest started, by id, and the one tracked (M6.6). */
export interface QuestsSlice {
  quests: Record<string, QuestEntry>;
  /** The quest whose targets the walk points at: the last started, or the journal's choice. */
  tracked?: string;
}
