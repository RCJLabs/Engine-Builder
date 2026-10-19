/**
 * The dialogue kit's records and state (M3.8, D46, docs/specs/dialogue.md): speakers, and talks of
 * lines and options in dirtbag's TalkDef shape; the open talk and the line it is at, those
 * waiting, and what has been heard and said.
 */
import type { Condition, Effect } from '@eb/core';
import type { Choice, Outcome } from '../events/types.ts';

/** The kit's id, its module's id and the key of its slice. */
export const DIALOGUE = 'dialogue';
export const SPEAKER = 'speaker';
export const TALK = 'talk';
/** The mode a talk is open in, its data `{ talk }`: the line it is at is the slice's. */
export const TALKING = 'talking';

/** records/speaker/<id>.json: who says a line. */
export interface SpeakerRecord {
  readonly name: string;
  /** An image from Assets, shown with the line. */
  readonly portrait?: string;
}

/** An option's outcome, which can lead to a line of its own. */
export interface TalkOutcome extends Outcome {
  readonly next?: string;
}

/** What the player can say back: an event's choice without its result, which leads to a line. */
export interface TalkOption extends Omit<Choice, 'result' | 'outcomes'> {
  /** Hidden once it has been said. */
  readonly once?: boolean;
  /** The line it leads to; the talk ends when there is none. */
  readonly next?: string;
  readonly outcomes?: readonly TalkOutcome[];
}

export interface Line {
  /** Lowercase words joined by hyphens, once in the talk. */
  readonly id: string;
  /** Who says it, when not the talk's speaker. */
  readonly speaker?: string;
  readonly text: string;
  /** What hearing it does, as it is shown. */
  readonly effects?: readonly Effect[];
  readonly options?: readonly TalkOption[];
  /** Where the talk goes on to when no option is shown; it ends when there is none. */
  readonly next?: string;
}

export interface Start {
  /** The first start whose condition holds opens the talk at its line. */
  readonly if?: Condition;
  readonly line: string;
}

/** records/talk/<id>.json: one conversation, start to end. */
export interface TalkRecord {
  readonly name?: string;
  readonly speaker?: string;
  /** Each option shows its outcomes, their chances and what they do: hidden when left out (D45). */
  readonly 'show-odds'?: boolean;
  readonly starts: readonly Start[];
  readonly lines: readonly Line[];
}

/** The open talk and the line it is at. */
export interface OpenTalk {
  talk: string;
  line: string;
}

/** The kit's slice, as a handler writes it; read() gives it read-only. */
export interface DialogueSlice {
  /** Left out when no talk is open. */
  open?: OpenTalk;
  /** Talks opened while another was, to open in turn. */
  waiting: string[];
  /** How many times each talk has opened. */
  talked: Record<string, number>;
  /** How many times each line of each talk has been shown. */
  heard: Record<string, Record<string, number>>;
  /** Each option ever said in each talk, sorted. */
  said: Record<string, string[]>;
}
