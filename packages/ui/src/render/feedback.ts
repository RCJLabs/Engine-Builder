/**
 * What the page keeps of a play's feedback (M4.2, docs/specs/input.md): the log's lines, the toasts
 * waiting, and how long each stays. Plain functions, so the rules are tested without timers.
 */
import { LOG_KEPT, type Said } from '../format/feedback.ts';

/** A line of the log, numbered from the start of the play so a redraw keeps each in its place. */
export interface LogLine {
  readonly n: number;
  readonly text: string;
}

/** The log after a step: the lines said to the log, newest last, the last LOG_KEPT of them kept. */
export function logAfter(log: readonly LogLine[], said: readonly Said[]): readonly LogLine[] {
  const added = said.filter((line) => line.to !== 'toast');
  if (added.length === 0) return log;
  const first = (log.at(-1)?.n ?? 0) + 1;
  return [...log, ...added.map((line, i) => ({ n: first + i, text: line.text }))].slice(-LOG_KEPT);
}

/** The step's lines that toast. */
export const toastsOf = (said: readonly Said[]): string[] =>
  said.filter((line) => line.to !== 'log').map((line) => line.text);

/** What the announcer speaks after a step: every line once, in order. */
export const spokenOf = (said: readonly Said[]): string => said.map((line) => line.text).join(' ');

export const TOAST_LEAST = 2600;
export const TOAST_PER_CHARACTER = 45;
export const TOAST_HURRIED = 1400;

/** How long a toast stays: by its length, cut short while others wait (from Dirtbag's game.ts). */
export function toastTime(text: string, waiting: boolean): number {
  const full = Math.max(TOAST_LEAST, TOAST_PER_CHARACTER * text.length);
  return waiting ? Math.min(full, TOAST_HURRIED) : full;
}
