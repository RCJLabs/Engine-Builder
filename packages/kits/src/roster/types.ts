/**
 * The roster kit's records and state (M3.6, D44, docs/specs/roster.md): recruit templates, halls
 * that offer recruits, and the roster's settings; the members, what was rolled for each recruit,
 * those who left and why, the halls' rounds and the bonds between pairs.
 */
import type { Banded, Bounds } from '../bands.ts';

/** The kit's id, its module's id and the key of its slice. */
export const ROSTER = 'roster';
export const RECRUIT = 'recruit';
export const HALL = 'hall';
/** The record type of the roster's settings, of which a game has at most one. */
export const ROSTER_RECORD = 'roster';
/** The mode a hall is open in, its data `{ hall }`. */
export const HIRING = 'hiring';

/** Whole amounts by resource: what a fee costs (the economy kit's pay-cost). */
export type Fee = Readonly<Record<string, number>>;

export interface StatRange {
  readonly min: number;
  /** `min` when left out. */
  readonly max?: number;
}

export interface Trait {
  /** A status the stats kit has, which a recruit drawing it starts with. */
  readonly status: string;
  /** Whole percent, 1 to 100. */
  readonly chance: number;
  /** Added to the recruit's fee when drawn. */
  readonly fee?: Fee;
}

/** records/recruit/<id>.json: what a recruit is rolled from. */
export interface RecruitRecord {
  readonly name?: string;
  readonly description?: string;
  /** The written actor a recruit copies. */
  readonly actor: string;
  readonly names: readonly string[];
  readonly bynames?: readonly string[];
  readonly stats?: Readonly<Record<string, StatRange>>;
  readonly traits?: readonly Trait[];
  /** The most traits a recruit draws: no limit when left out. */
  readonly most?: number;
  readonly fee?: Fee;
}

export interface HallRecruit {
  readonly recruit: string;
  /** 1 when left out. */
  readonly weight?: number;
}

/** records/hall/<id>.json: a place that offers recruits. */
export interface HallRecord {
  readonly name?: string;
  readonly description?: string;
  /** Recruits offered a round: 1 when left out. */
  readonly offers?: number;
  readonly recruits: readonly HallRecruit[];
}

export interface Rank extends Banded {
  readonly name?: string;
  /** What a member at this rank has, until its rank moves on. */
  readonly status?: string;
}

export interface Ladder {
  /** The stat whose value ranks a member. */
  readonly stat: string;
  readonly bands: readonly Rank[];
}

export interface BondBand extends Banded {
  readonly name?: string;
}

export interface BondSettings extends Bounds {
  /** 0 when left out, kept within the bounds. */
  readonly start?: number;
  readonly bands?: readonly BondBand[];
}

/** records/roster/<id>.json: the roster's settings. */
export interface RosterRecord {
  readonly name?: string;
  readonly description?: string;
  readonly cap?: number;
  /** A number flag whose value is the cap: it wins over `cap`. */
  readonly 'cap-flag'?: string;
  readonly start?: readonly string[];
  readonly ranks?: Ladder;
  readonly bonds?: BondSettings;
}

/** What was rolled for a recruit: laid over its template's actor to make its record. */
export interface Rolled {
  readonly recruit: string;
  readonly name: string;
  readonly stats?: Readonly<Record<string, number>>;
  readonly traits?: readonly string[];
}

export interface HallState {
  readonly round: number;
  /** The slots hired this round. */
  readonly hired?: readonly number[];
}

export interface RosterSlice {
  /** Drawn once from the kit's stream as the game starts: offers are worked out from it. */
  readonly salt: number;
  /** The number the next recruit gets: it counts every recruit made and never goes back. */
  readonly next: number;
  /** On the roster now, in the order they joined. */
  readonly members: readonly string[];
  /** What was rolled for every recruit ever made, gone ones too. */
  readonly made: Readonly<Record<string, Rolled>>;
  /** Why each actor who left did. */
  readonly gone: Readonly<Record<string, string>>;
  /** Halls refreshed or hired from. */
  readonly halls: Readonly<Record<string, HallState>>;
  /** Bonds that differ from the start, by the two ids sorted and joined by "|". */
  readonly bonds: Readonly<Record<string, number>>;
  /** The rank each member was last given, so a move takes the old rank's status off. */
  readonly ranks: Readonly<Record<string, string>>;
}
