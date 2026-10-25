/**
 * The world module's data and slice (M5.8, D70; M5.9, D71, docs/specs/worldspaces.md): what the
 * pack gives it and what a save keeps. Apart from the module so its actions read them too.
 */
import type { Condition } from '../logic/types.ts';
import type { Effect } from '../sim/types.ts';

/** The world module's id, and its slice's key. */
export const WORLD = 'world';

/** A trigger zone as the pack holds it: its condition as a tree, its effects as written. */
export interface TriggerZone {
  readonly when?: Condition;
  readonly effects: readonly Effect[];
  readonly once?: boolean;
}

/** An object's interact (M5.9): what its prompt says, when it shows, and what using it does. */
export interface WorldUse {
  readonly label: string;
  readonly when?: Condition;
  readonly effects: readonly Effect[];
  readonly once?: boolean;
  /** Using it takes the object: it is drawn and solid no more, kept in the slice's `taken`. */
  readonly takes?: boolean;
}

/** By space id, then by the object's path: its id, or "placement/inner" through a prefab. */
export type Triggers = Readonly<Record<string, Readonly<Record<string, TriggerZone>>>>;
export type Uses = Readonly<Record<string, Readonly<Record<string, WorldUse>>>>;

/** What the module is built from: the pack's zones and uses, each space's spawn points, and the start. */
export interface WorldData {
  readonly triggers: Triggers;
  readonly uses: Uses;
  /** Each space's spawn points by object path, sorted: every space is a key. */
  readonly spawns: Readonly<Record<string, readonly string[]>>;
  /** The space a new game starts in. */
  readonly start: string;
}

/** Where the player stood as the stage last said: in a space, the feet's place and the way they faced. */
export interface StoodAt {
  readonly space: string;
  readonly feet: readonly [number, number, number];
  /** Degrees, as the stage turns: 0 faces −z. */
  readonly yaw: number;
}

export interface WorldSlice {
  /** The once zones and once uses that have run, as "space/object", sorted. */
  readonly fired: readonly string[];
  /** The space the player is in; the start when left out, as a version 1 save is. */
  readonly space?: string;
  readonly at?: StoodAt;
  /** The spawn point the player arrives at in `space`, when `at` isn't there: its start when left out. */
  readonly arrive?: string;
  /** The objects taken, as "space/object", sorted. */
  readonly taken: readonly string[];
}

/** The slice's shape: 2 since M5.9, which added where the player is and what was taken. */
export const WORLD_VERSION = 2;

/** A world with no spaces' data: what a check builds the module from when only its names matter. */
export const EMPTY_WORLD: WorldData = { triggers: {}, uses: {}, spawns: {}, start: '' };

export const placeKey = (space: string, object: string) => `${space}/${object}`;
