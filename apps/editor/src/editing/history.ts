/**
 * The command log behind undo and redo. A step is a set of file changes, each with what the file
 * held before and after, and a label for the user. Undo puts the befores back and redo the
 * afters. Ported from space-wrecked's builder session (src/sim/session.js): past and future
 * stacks of entries that carry both states and a label.
 *
 * Pure: the caller passes the time, so grouping is tested without a clock.
 */

/** A file's bytes, or null when there is no such file. */
export type FileState = Uint8Array | null;

export interface FileChange {
  readonly path: string;
  readonly before: FileState;
  readonly after: FileState;
}

export interface Step {
  readonly label: string;
  readonly changes: readonly FileChange[];
  /** Steps with the same group, made close together, become one: typing in one field. */
  readonly group?: string;
  /** When it was made, in ms, for grouping. */
  readonly at: number;
}

export interface History {
  readonly past: readonly Step[];
  readonly future: readonly Step[];
  /** Whether the last step may take in the next one. An undo or redo closes it. */
  readonly open: boolean;
}

export interface HistoryLimits {
  /** How long after a step another in its group still joins it. */
  readonly groupMs: number;
  /** The most steps kept; the oldest go first. */
  readonly depth: number;
}

export const emptyHistory = (): History => ({ past: [], future: [], open: false });

export function sameState(a: FileState, b: FileState): boolean {
  if (a === null || b === null) return a === b;
  return a.byteLength === b.byteLength && a.every((byte, i) => byte === b[i]);
}

/** `later` folded into `earlier`: each file keeps its first before and takes its last after. */
function fold(earlier: Step, later: Step): Step {
  const changes = new Map(earlier.changes.map((change) => [change.path, change]));
  for (const change of later.changes) {
    const first = changes.get(change.path);
    changes.set(change.path, first ? { path: change.path, before: first.before, after: change.after } : change);
  }
  return { ...later, label: earlier.label, changes: [...changes.values()] };
}

const changesNothing = (step: Step) => step.changes.every((change) => sameState(change.before, change.after));

/** Adds a step. Redo's steps are gone after a new edit, as everywhere else. */
export function record(history: History, step: Step, limits: HistoryLimits): History {
  const last = history.past[history.past.length - 1];
  const joins =
    history.open &&
    last !== undefined &&
    step.group !== undefined &&
    last.group === step.group &&
    step.at - last.at <= limits.groupMs;
  const kept = joins ? history.past.slice(0, -1) : history.past;
  const next = joins ? fold(last, step) : step;
  // Typing a field back to what it was leaves nothing to undo.
  const past = changesNothing(next) ? kept : [...kept, next];
  return { past: past.slice(-limits.depth), future: [], open: true };
}

/** The step to take back, whose befores go back in place, and the history after it. */
export function undo(history: History): { history: History; step: Step } | null {
  const step = history.past[history.past.length - 1];
  if (!step) return null;
  return { history: { past: history.past.slice(0, -1), future: [...history.future, step], open: false }, step };
}

/** The step to make again, whose afters go back in place, and the history after it. */
export function redo(history: History): { history: History; step: Step } | null {
  const step = history.future[history.future.length - 1];
  if (!step) return null;
  return { history: { past: [...history.past, step], future: history.future.slice(0, -1), open: false }, step };
}
