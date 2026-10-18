/**
 * The stats kit's records and state (M3.4, D42, docs/specs/stats.md): stats, actors with a base
 * for each, and statuses whose modifiers add, then take a percent. Whole numbers only. The state
 * holds only what differs from content, so a content update reaches every save.
 */

/** The kit's id, its module's id and the key of its slice. */
export const STATS = 'stats';
export const STAT = 'stat';
export const ACTOR = 'actor';
export const STATUS = 'status';

/** records/stat/<id>.json */
export interface StatRecord {
  readonly name?: string;
  readonly description?: string;
  /** 0 when left out: a value is never below it, and nor is what damage leaves. */
  readonly min?: number;
  /** No limit when left out. */
  readonly max?: number;
  /** The base of an actor whose record leaves the stat out: `min` when left out. */
  readonly start?: number;
}

/** What a status, or a worn item, does to one stat for each stack. */
export interface Modifier {
  readonly stat: string;
  /** Whole points, added before the percents. */
  readonly add?: number;
  /** Whole percents, all of them summed, then applied once. */
  readonly percent?: number;
}

/** How long an applied status lasts: one of the two. Left out, until removed. */
export interface Lasts {
  readonly days?: number;
  readonly ticks?: number;
}

/** records/status/<id>.json */
export interface StatusRecord {
  readonly name?: string;
  readonly description?: string;
  readonly modifiers?: readonly Modifier[];
  readonly lasts?: Lasts;
  /** The most stacks it can have: 1 when left out. */
  readonly stacks?: number;
  /** Words conditions count statuses by (`stats.tagged`). */
  readonly tags?: readonly string[];
}

/** records/actor/<id>.json. The gear kit adds `slots` and `wears` (gear/types.ts). */
export interface ActorRecord {
  readonly name?: string;
  readonly description?: string;
  /** Its base for each stat it gives; the rest have their stat's start. */
  readonly stats?: Readonly<Record<string, number>>;
  /** The statuses it starts with, a stack each, until removed. */
  readonly statuses?: readonly string[];
}

/** When an applied status ends: the day it ends on, or the tick. */
export type Until = { readonly day: number } | { readonly tick: number };

export interface StatusState {
  readonly stacks: number;
  readonly until?: Until;
}

/** One actor's state: none of it when it is as its record has it. */
export interface ActorState {
  /** What add-to-stat added to each base: none at 0. */
  readonly raised?: Readonly<Record<string, number>>;
  /** The damage taken by each stat: none at 0. */
  readonly damage?: Readonly<Record<string, number>>;
  /** Statuses whose stacks differ from the record's (1 for one it lists, 0 otherwise), or that have an `until`. */
  readonly statuses?: Readonly<Record<string, StatusState>>;
}

export interface StatsSlice {
  readonly actors: Readonly<Record<string, ActorState>>;
}
