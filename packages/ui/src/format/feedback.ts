/**
 * A game's feedback as `ui/feedback.json` holds it (M4.2, D52, docs/specs/input.md#feedback): lines
 * that word the beats the game wants said. The sim's beats carry no words (D22), so a game's words
 * for them live here, beside its screens, and the worker fills them in after each step.
 */
import type { Value } from '@eb/core';
import type { Buzz } from './audio.ts';

/** Where a line goes: a toast, the log, or both, the default. */
export const FEEDBACK_TO = ['toast', 'log', 'both'] as const;
export type FeedbackTo = (typeof FEEDBACK_TO)[number];

export interface FeedbackLine {
  /** An event the game declares, such as "inventory/gained". */
  readonly on: string;
  /** Some of the event's arguments: the line says only beats whose arguments equal these. */
  readonly where?: Readonly<Record<string, Value>>;
  /** Words whose holes are the event's arguments, as `{.item}`. Optional since M4.8: a line may only sound or buzz. */
  readonly say?: string;
  readonly to?: FeedbackTo;
  /** A sound record's id, played as the beat comes (M4.8, D58). */
  readonly sound?: string;
  /** A buzz by name: one a step, the heaviest. */
  readonly buzz?: Buzz;
}

export interface Feedback {
  readonly lines: readonly FeedbackLine[];
}

/** What a step said: a line's words filled in, and where they go. */
export interface Said {
  readonly text: string;
  readonly to: FeedbackTo;
}

/** The lines the page keeps for log widgets, newest last. */
export const LOG_KEPT = 100;
