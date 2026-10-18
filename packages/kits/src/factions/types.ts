/**
 * The factions kit's records and state (M3.5, D43, docs/specs/factions.md): factions, the
 * party's standing with each in a range of the faction's own, and the bands a standing falls in.
 * Whole numbers only. The state holds only standings that differ from their start, so a content
 * update to a start reaches every save in which that faction never moved.
 */

/** The kit's id, its module's id and the key of its slice. */
export const FACTIONS = 'factions';
export const FACTION = 'faction';

/** One band of a faction's standing, listed lowest first. */
export interface Band {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  /** Where it begins. The first band's can be left out: it holds everything below the second. */
  readonly from?: number;
  /** The share of what a shop naming the faction charges, in percent: 100 when left out. */
  readonly price?: number;
}

/** A standing that moves back toward a resting value. */
export interface Drift {
  /** Days between steps of one point, 1 or more. */
  readonly every: number;
  /** Where it rests: the faction's start when left out. */
  readonly toward?: number;
}

/** records/faction/<id>.json */
export interface FactionRecord {
  readonly name?: string;
  readonly description?: string;
  /** No bound that way when left out. */
  readonly min?: number;
  readonly max?: number;
  /** 0 when left out, or the nearer bound when 0 is outside them. */
  readonly start?: number;
  readonly bands?: readonly Band[];
  readonly drift?: Drift;
}

export interface FactionsSlice {
  /** Standings that differ from their faction's start. */
  readonly standing: Readonly<Record<string, number>>;
}
