/**
 * When an open project's edits are written: SAVE_AFTER_MS after the last one, and at once when
 * asked (the page hides, the project closes, another tab takes over). One save runs at a time;
 * edits made while it runs are left unsaved and go in the next. A failed save is tried again by
 * the next edit or by asking.
 */
import type { SavedFile } from './journal.ts';
import type { WorkingCopy } from './workingCopy.ts';

/** Long enough to take in a burst of typing, short enough that little is ever unsaved. */
export const SAVE_AFTER_MS = 1_000;

export type SaveState =
  | { readonly kind: 'saved' }
  | { readonly kind: 'unsaved' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'failed'; readonly reason: string };

export interface Autosave {
  /** After an edit: the project is unsaved, and saves SAVE_AFTER_MS after the last edit. */
  touch(): void;
  /** Saves what is unsaved now, after any save already running. Rejects when the save fails. */
  flush(): Promise<void>;
  /** Stops the timer; whatever is unsaved stays so. */
  stop(): void;
}

export interface Timers {
  set(run: () => void, ms: number): unknown;
  clear(timer: unknown): void;
}

const browserTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

export function autosave(
  copy: WorkingCopy,
  write: (files: SavedFile[]) => Promise<void>,
  onState: (state: SaveState) => void,
  timers: Timers = browserTimers,
): Autosave {
  let timer: unknown = null;
  let chain: Promise<void> = Promise.resolve();

  const saveOnce = async (): Promise<void> => {
    const unsaved = copy.unsaved();
    if (unsaved.size === 0) return onState({ kind: 'saved' });
    onState({ kind: 'saving' });
    try {
      await write([...unsaved].map(([path, bytes]) => ({ path, bytes })));
    } catch (error) {
      onState({ kind: 'failed', reason: error instanceof Error ? error.message : String(error) });
      throw error;
    }
    copy.saved(unsaved);
    onState({ kind: copy.unsaved().size === 0 ? 'saved' : 'unsaved' });
  };

  const flush = (): Promise<void> => {
    if (timer !== null) timers.clear(timer);
    timer = null;
    // After the save before it, whether that one worked or not.
    chain = chain.then(saveOnce, saveOnce);
    return chain;
  };

  return {
    touch() {
      onState({ kind: 'unsaved' });
      if (timer !== null) timers.clear(timer);
      // A failure shows in the state; the next edit or flush tries again.
      timer = timers.set(() => void flush().catch(() => undefined), SAVE_AFTER_MS);
    },
    flush,
    stop() {
      if (timer !== null) timers.clear(timer);
      timer = null;
    },
  };
}
