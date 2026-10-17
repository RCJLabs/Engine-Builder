/**
 * One open project being edited in this tab: its working copy, its command log and its saves,
 * kept in step. Edits, undos and redos run one at a time in the order asked, so an edit that
 * reads a file always reads it after the edit before it.
 */
import { type Signal, signal } from '@preact/signals';
import { type Autosave, autosave, type SaveState, type Timers } from './autosave.ts';
import {
  emptyHistory,
  type FileChange,
  type History,
  type HistoryLimits,
  record,
  redo,
  type Step,
  undo,
} from './history.ts';
import type { SavedFile } from './journal.ts';
import type { WorkingCopy } from './workingCopy.ts';

/** Grouping and depth: CodeMirror's and ProseMirror's own defaults (see the spec). */
export const LIMITS: HistoryLimits = { groupMs: 500, depth: 100 };

export interface EditSession {
  readonly copy: WorkingCopy;
  readonly history: Signal<History>;
  readonly saveState: Signal<SaveState>;
  /**
   * Makes the changes `make` gives, as one step, after the edits before it. Same `group` within
   * LIMITS.groupMs joins the last step: typing in one field undoes as one.
   */
  edit(label: string, make: (copy: WorkingCopy) => Promise<readonly FileChange[]>, group?: string): Promise<void>;
  /** Resolves to the step undone, or null when there was none. */
  undo(): Promise<Step | null>;
  redo(): Promise<Step | null>;
  /** Saves what is unsaved, now. Rejects when the save fails. */
  flush(): Promise<void>;
  /** Stops saving on a timer; what is unsaved stays so. */
  stop(): void;
}

export interface SessionOptions {
  readonly copy: WorkingCopy;
  readonly write: (files: SavedFile[]) => Promise<void>;
  /** Told after every edit, undo and redo, for what shows the files (the summary). */
  readonly changed?: (changes: readonly FileChange[]) => void;
  readonly now?: () => number;
  readonly timers?: Timers;
  readonly limits?: HistoryLimits;
}

export function editSession(options: SessionOptions): EditSession {
  const { copy, write, changed = () => undefined, now = Date.now, limits = LIMITS } = options;
  const history = signal(emptyHistory());
  const saveState = signal<SaveState>({ kind: 'saved' });
  const saver: Autosave = autosave(copy, write, (state) => (saveState.value = state), options.timers);
  let queue: Promise<unknown> = Promise.resolve();

  // Each job waits for the one before, whatever became of it.
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  };

  const travel = (take: typeof undo, side: 'before' | 'after') =>
    enqueue(async () => {
      const taken = take(history.value);
      if (!taken) return null;
      copy.apply(taken.step.changes, side);
      history.value = taken.history;
      saver.touch();
      changed(taken.step.changes);
      return taken.step;
    });

  return {
    copy,
    history,
    saveState,
    edit: (label, make, group) =>
      enqueue(async () => {
        const changes = await make(copy);
        if (changes.length === 0) return;
        copy.apply(changes, 'after');
        history.value = record(history.value, { label, changes, at: now(), ...(group ? { group } : {}) }, limits);
        saver.touch();
        changed(changes);
      }),
    undo: () => travel(undo, 'before'),
    redo: () => travel(redo, 'after'),
    flush: () => enqueue(() => saver.flush()),
    stop: () => saver.stop(),
  };
}
