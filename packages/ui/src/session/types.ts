/**
 * What a game's session sends the page after each step (docs/specs/screens.md#session): plain JSON,
 * so nothing that crosses from the worker can run on the page. The page draws from this alone;
 * it never reads the sim's state.
 */
import type { Action } from '@eb/core';
import type { RecordsWant } from '../format/bindings.ts';
import type { FightView } from './fighting.ts';
import type { QuestMarker } from './markers.ts';

/** A value a template shows: a fact's, an entry's field, a view's field. Null is "no value", shown as —. */
export type Shown = string | number | boolean | null;

/** One entry of a list: what its item's `{.field}` reads, and the action that comes with it. */
export interface Entry {
  /** Unique in its list, so a redraw keeps focus on the same entry. */
  readonly key: string;
  readonly fields: Readonly<Record<string, Shown>>;
  readonly action?: Action;
  /** Its action is on offer now. An entry without one is never enabled. */
  readonly enabled: boolean;
  /** A codex entry's facts that name `@entry`, read for it, by their text as written (M4.4). */
  readonly facts?: Readonly<Record<string, Shown>>;
  /** A codex entry's shows-when that name `@entry`, held for it, by their text as written. */
  readonly conditions?: Readonly<Record<string, boolean | null>>;
  /** False for a codex entry held back by its list's `known`: nothing of its record is in it. */
  readonly known?: boolean;
}

/** A move that reaches a node, as its button says it (M4.6): what it costs and takes, and why it can't be taken. */
export interface MapTravel {
  /** Unique among the node's travels. */
  readonly key: string;
  readonly label: string;
  readonly action: Action;
  /** Its action is on offer now. */
  readonly enabled: boolean;
  readonly cost: string | null;
  readonly takes: string | null;
  /** What its effects do, by their previews: "heat 0 → 2". */
  readonly changes: string | null;
  readonly why: string | null;
}

/** A node of the map, its name, kind and description only once it is known. */
export interface MapNode {
  readonly id: string;
  readonly layer: number;
  readonly slot: number;
  /** A drawn map's place, 0 to 100 each way. */
  readonly x?: number;
  readonly y?: number;
  readonly known: boolean;
  readonly visited: boolean;
  readonly name: string | null;
  readonly kind: string | null;
  readonly description: string | null;
  /** Each move that reaches it, in the map's order. */
  readonly travels: readonly MapTravel[];
}

/** The map the party is on, as the map widget draws it (M4.6, docs/specs/maps.md#the-map-widget). */
export interface MapView {
  readonly map: string;
  readonly name: string;
  readonly shape: 'layered' | 'drawn';
  /** A layered map's layers, its start's and end's among them; 1 on a drawn map. */
  readonly layers: number;
  /** The node the party stands on. */
  readonly at: string;
  readonly nodes: readonly MapNode[];
  /** Each link once; a one-way link goes only from `from` to `to`. */
  readonly links: readonly { readonly from: string; readonly to: string; readonly oneWay: boolean }[];
}

export interface View {
  /** The game's modes, bottom to top. */
  readonly modes: readonly string[];
  /** Every action on offer, in the order the game lists them. */
  readonly offered: readonly Action[];
  /** The value of each fact the screens name, by its text as written. */
  readonly facts: Readonly<Record<string, Shown>>;
  /** Each `shows-when`, by its text: true, false, or null when unknown. */
  readonly conditions: Readonly<Record<string, boolean | null>>;
  /** The views' own fields, such as `talk.text`, while they apply. */
  readonly fields: Readonly<Record<string, Shown>>;
  /** The entries of each list that applies now, by listKey: a source's name, or a codex list's key (M4.4). */
  readonly lists: Readonly<Record<string, readonly Entry[]>>;
  /** The map the party is on, with the maps kit on and a map entered (M4.6). */
  readonly map?: MapView;
  /** Where the player is in the game's spaces, for the stage (M5.9): a game with spaces has it. */
  readonly world?: WorldView;
  /** How many actions the game has taken. */
  readonly turn: number;
  /** Nothing is on offer: the game is over. */
  readonly ended: boolean;
}

/** The world module's slice as the stage reads it (M5.9, D71, docs/specs/worldspaces.md#where-the-player-is). */
export interface WorldView {
  readonly space: string;
  /** Where the player last stood, in a space: in `space`, unless the stage is a step behind. */
  readonly at?: { readonly space: string; readonly feet: readonly [number, number, number]; readonly yaw: number };
  /** The spawn point to arrive at in `space` when `at` is left out. */
  readonly arrive?: string;
  /** The objects taken in every space, as "space/object". */
  readonly taken: readonly string[];
  /** Each NPC the sim has heard of or sent somewhere (M6.2): its space, where it stood, its goal, where it got to. */
  readonly npcs?: Readonly<Record<string, NpcView>>;
  /** The game's clock runs while walking (M6.3, D75): the time kit follows real time and the mode allows time/elapse. */
  readonly clock?: true;
  /** The fights (M6.4, D76): with the fighting kit on and project.json's fighting given. */
  readonly fight?: FightView;
  /** The tracked quest's open objectives with a target (M6.6, D78): where the compass and markers point. */
  readonly markers?: readonly QuestMarker[];
}

/** An NPC as the world module keeps it (M6.2, D74). */
export interface NpcView {
  readonly space: string;
  readonly feet?: readonly [number, number, number];
  readonly yaw?: number;
  readonly goal?: string;
  readonly arrived?: string;
  /** M6.3 (D75): the metres it keeps from the player it follows, or that it stands turned to them. */
  readonly follow?: number;
  readonly facing?: 'player';
  /** M6.4 (D76): its turn among those sent to attack the player, and fallen. */
  readonly fight?: number;
  readonly down?: true;
}

/** What the page's screens name, sent once as a session starts: the facts and conditions to read after each step. */
export interface Wants {
  readonly facts: readonly string[];
  readonly conditions: readonly string[];
  /** The codex lists, each read for every record of its type (M4.4). */
  readonly records?: readonly RecordsWant[];
}
