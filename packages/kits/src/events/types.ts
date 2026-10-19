/**
 * The events kit's records and state (M3.7, D45, docs/specs/events.md): choice events and the
 * decks they are drawn from; the open event and those waiting, what has been seen and chosen,
 * each deck's draws, and the consequences still to land.
 */
import type { Condition, Effect } from '@eb/core';

/** The kit's id, its module's id and the key of its slice. */
export const EVENTS = 'events';
/** A choice event's record type. */
export const EVENT = 'event';
export const DECK = 'deck';
/** The mode an event is open in, its data `{ event }`. */
export const CHOOSING = 'choosing';

/** Whole amounts by resource: what a choice costs (the economy kit's pay-cost). */
export type Cost = Readonly<Record<string, number>>;

export interface Outcome {
  /** Whole percent, 1 to 100. A choice's chances add up to 100. */
  readonly chance: number;
  readonly result?: string;
  readonly effects: readonly Effect[];
}

export interface Choice {
  /** Lowercase words joined by hyphens, once in its event: what conditions and events call it. */
  readonly id: string;
  readonly label: string;
  /** While it doesn't hold, the choice isn't shown. */
  readonly if?: Condition;
  /** While it doesn't hold, the choice is shown locked, with the condition in words. */
  readonly needs?: Condition;
  /** Paid as it is chosen; while the party is short, the choice is locked. */
  readonly cost?: Cost;
  readonly result?: string;
  /** What it does for sure, after the cost. */
  readonly effects?: readonly Effect[];
  /** One is rolled after `effects`. */
  readonly outcomes?: readonly Outcome[];
}

/** records/event/<id>.json: a choice event. */
export interface EventRecord {
  readonly name?: string;
  readonly text?: string;
  /** Each choice shows its outcomes, their chances and what they do: hidden when left out (D45). */
  readonly 'show-odds'?: boolean;
  readonly choices: readonly Choice[];
}

export interface DeckEntry {
  readonly event: string;
  /** 1 when left out. */
  readonly weight?: number;
  /** While it doesn't hold, the event can't be drawn. */
  readonly if?: Condition;
  /** Once seen, the event is never drawn again. */
  readonly once?: boolean;
}

/** records/deck/<id>.json: the events that can come up somewhere. */
export interface DeckRecord {
  readonly name?: string;
  readonly description?: string;
  readonly events: readonly DeckEntry[];
  /** An event among the deck's last `recent` draws is passed over: 0 when left out. */
  readonly recent?: number;
  /** An event never seen has its weight times this: 1 when left out. */
  readonly unseen?: number;
}

/** When a consequence comes due: as a day starts, after a count of choices, or at a number flag's value. */
export type Due =
  | { readonly day: number }
  | { readonly choices: number }
  | { readonly flag: string; readonly at: number };

/** What booked a consequence, when a choice did: the receipt `landed` carries. */
export interface Receipt {
  readonly event: string;
  readonly choice: string;
}

/** A consequence still to land, with its effects and condition as they were booked. */
export interface Later {
  readonly id: string;
  /** The order it was booked in, which decides between those due at once. */
  readonly seq: number;
  readonly due: Due;
  readonly if?: Condition;
  readonly do: readonly Effect[];
  readonly from?: Receipt;
}

export interface DeckState {
  /** Draws made, which the next draw's stream is worked out from. */
  draws: number;
  /** The last `recent` events drawn, oldest first. */
  recent: string[];
}

/** The kit's slice, as a handler writes it; read() gives it read-only. */
export interface EventsSlice {
  /** Drawn once, below 2^31: decks draw from it. */
  salt: number;
  /** The event open now; left out when none is. */
  open?: string;
  /** Events opened while another was, to open in turn. */
  waiting: string[];
  /** How many times each event has opened. */
  seen: Record<string, number>;
  /** Each choice ever made at an event, sorted. */
  chose: Record<string, string[]>;
  /** Every choice made. */
  choices: number;
  decks: Record<string, DeckState>;
  /** In the order booked. */
  laters: Later[];
  /** The seq the next consequence gets, and its number in a "#n" id. */
  next: number;
  /**
   * The choice being made while its effects and outcome apply: the receipt a consequence they
   * book keeps. Taken out before the action ends, so a save never holds it.
   */
  choosing?: Receipt;
}
