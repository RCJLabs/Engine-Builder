/**
 * What a game's session sends the page after each step (docs/specs/screens.md#session): plain JSON,
 * so nothing that crosses from the worker can run on the page. The page draws from this alone;
 * it never reads the sim's state.
 */
import type { Action } from '@eb/core';
import type { RecordsWant } from '../format/bindings.ts';

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
  /** How many actions the game has taken. */
  readonly turn: number;
  /** Nothing is on offer: the game is over. */
  readonly ended: boolean;
}

/** What the page's screens name, sent once as a session starts: the facts and conditions to read after each step. */
export interface Wants {
  readonly facts: readonly string[];
  readonly conditions: readonly string[];
  /** The codex lists, each read for every record of its type (M4.4). */
  readonly records?: readonly RecordsWant[];
}
