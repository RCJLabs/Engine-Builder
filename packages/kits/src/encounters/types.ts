/**
 * The encounters kit's records and state (M4.7, D57, docs/specs/encounters.md): the stats a fight
 * reads, encounters of foes, and how many fights each has seen won and lost.
 */
import type { Effect } from '@eb/core';

/** The kit's id, its module's id and the key of its slice. */
export const ENCOUNTERS = 'encounters';
export const COMBAT = 'combat';
export const ENCOUNTER = 'encounter';

/** A roll is out of this many: each result's whole percent times 100. */
export const ROLL_OUT_OF = 10_000;
export const HIT_MIN = 5;
export const HIT_MAX = 95;
export const ROUNDS = 20;

/** records/combat/<id>.json: the stats a fight reads. */
export interface CombatRecord {
  readonly name?: string;
  readonly health: string;
  readonly hit: string;
  readonly dodge?: string;
  readonly damage: string;
  readonly armour?: string;
  readonly 'hit-min'?: number;
  readonly 'hit-max'?: number;
  readonly rounds?: number;
}

export interface Foe {
  readonly actor: string;
  /** 1 when left out. */
  readonly count?: number;
}

/** What happens to each of the party who falls. */
export interface Falls {
  readonly status?: string;
  /** Why a member leaves the roster: only with the roster kit on (W137). */
  readonly leave?: string;
}

/** records/encounter/<id>.json */
export interface EncounterRecord {
  readonly name?: string;
  readonly description?: string;
  readonly combat: string;
  readonly foes: readonly Foe[];
  /** Who fights for the player, the front first; the roster's members when left out. */
  readonly fighters?: readonly string[];
  /** The foes break once they have lost this percent of their health: 100 when left out. */
  readonly breaks?: number;
  readonly win?: readonly Effect[];
  readonly draw?: readonly Effect[];
  readonly lose?: readonly Effect[];
  readonly falls?: Falls;
}

export const RESULTS = ['win', 'draw', 'lose'] as const;
export type Result = (typeof RESULTS)[number];

/** The fight effect's stance: added to that stat of every one of the party, for this fight. */
export const STANCE = ['hit', 'dodge', 'damage', 'armour'] as const;
export type Stance = Partial<Readonly<Record<(typeof STANCE)[number], number>>>;

export interface EncountersSlice {
  /** Fights by encounter; none at 0. */
  fought: Record<string, number>;
  won: Record<string, number>;
  lost: Record<string, number>;
}
