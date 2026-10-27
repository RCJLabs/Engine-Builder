/**
 * The world module's data and slice (M5.8, D70; M5.9, D71, docs/specs/worldspaces.md): what the
 * pack gives it and what a save keeps. Apart from the module so its actions read them too.
 */
import type { Condition } from '../logic/types.ts';
import type { Effect } from '../sim/types.ts';
import type { WorldPlaces } from './places.ts';
import type { PackTiles } from './tiles/grid.ts';

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
  /** M6.8 (D80): the items it starts with; using it opens it, after its effects, in the inventory kit's container mode. */
  readonly holds?: Readonly<Record<string, number>>;
}

/** By space id, then by the object's path: its id, or "placement/inner" through a prefab. */
export type Triggers = Readonly<Record<string, Readonly<Record<string, TriggerZone>>>>;
export type Uses = Readonly<Record<string, Readonly<Record<string, WorldUse>>>>;

/** Where an actor is placed (M6.2): the space it stands in and its object's path there. */
export interface Placed {
  readonly space: string;
  readonly path: string;
}

/** What the module is built from: the pack's zones and uses, each space's spawn points, and the start. */
export interface WorldData {
  readonly triggers: Triggers;
  readonly uses: Uses;
  /** Each space's spawn points by object path, sorted: every space is a key. */
  readonly spawns: Readonly<Record<string, readonly string[]>>;
  /** The space a new game starts in. */
  readonly start: string;
  /** Format 11 (M6.2): each placed actor's space and path, so walk-to knows where it walks. */
  readonly actors: Readonly<Record<string, Placed>>;
  /**
   * M6.7 (D79): each space's name and tags, each tagged object's, and where each actor stands, which
   * a quest's slot can find. A world made by hand, as a test's, may leave them out.
   */
  readonly places?: WorldPlaces;
  /** M7.2 (D84): each space's tilemap, whose sight and cover the facts read. */
  readonly tiles?: Readonly<Record<string, PackTiles>>;
}

/** Where the player stood as the stage last said: in a space, the feet's place and the way they faced. */
export interface StoodAt {
  readonly space: string;
  readonly feet: readonly [number, number, number];
  /** Degrees, as the stage turns: 0 faces −z. */
  readonly yaw: number;
}

/**
 * An NPC as the sim keeps it (M6.2, D74): its space, where the stage last said it stood, the object
 * it is walking to and the one it last arrived at. One never sent anywhere is where it was placed.
 * Version 4 (M6.3, D75): instead of a goal, the metres it keeps from the player it follows, or, standing,
 * that it faces them.
 */
export interface NpcPlace {
  readonly space: string;
  readonly feet?: readonly [number, number, number];
  /** Degrees, as the stage turns: 0 faces −z. */
  readonly yaw?: number;
  readonly goal?: string;
  readonly arrived?: string;
  readonly follow?: number;
  readonly facing?: 'player';
  /**
   * Version 5 (M6.4, D76): sent to fight the player, its turn in the queue; the two lowest turns of
   * those standing are engaged, the rest circle.
   */
  readonly fight?: number;
  /** Fallen: its goals cleared, and no effect moves it again. */
  readonly down?: true;
}

export interface WorldSlice {
  /** The once zones and once uses that have run, as "space/object", sorted. */
  readonly fired: readonly string[];
  /** The space the player is in: the start in a new game, and in a version 1 save. */
  readonly space: string;
  readonly at?: StoodAt;
  /** The spawn point the player arrives at in `space`, when `at` isn't there: its start when left out. */
  readonly arrive?: string;
  /** The objects taken, as "space/object", sorted. */
  readonly taken: readonly string[];
  /** Version 3 (M6.2): the NPCs sent somewhere or said to stand somewhere, by actor. */
  readonly npcs: Readonly<Record<string, NpcPlace>>;
}

/**
 * The slice's shape: 2 since M5.9, which added where the player is and what was taken; 3 since M6.2,
 * the NPCs; 4 since M6.3, an NPC following the player or facing them; 5 since M6.4, an NPC fighting
 * the player or fallen.
 */
export const WORLD_VERSION = 5;

/** A world with no spaces' data: what a check builds the module from when only its names matter. */
export const EMPTY_WORLD: WorldData = {
  triggers: {},
  uses: {},
  spawns: {},
  start: '',
  actors: {},
};

export const placeKey = (space: string, object: string) => `${space}/${object}`;
