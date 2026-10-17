/**
 * Whether this tab may edit the open project, and the edit session when it may. A project opens
 * editable when the tab can take its lock and read only when another tab holds it. From read
 * only, "Edit here" asks the editing tab to save and hand over; if it doesn't answer within
 * HAND_OVER_MS (frozen in the background, say), "Take over" takes the lock from it.
 */
import { type Signal, signal } from '@preact/signals';
import { type EditSession, editSession } from './editSession.ts';
import type { FileChange, Step } from './history.ts';
import type { SavedFile } from './journal.ts';
import { type HeldLock, type Locks, takeLock } from './projectLock.ts';
import type { TabMessage, Tabs } from './tabs.ts';
import type { WorkingCopy } from './workingCopy.ts';

/** How long "Edit here" waits for the editing tab before offering to take over. */
export const HAND_OVER_MS = 5_000;

export type Access =
  | { readonly kind: 'closed' }
  | { readonly kind: 'editing' }
  /** Another tab edits it. `note` says why this tab stopped, when it was editing. */
  | { readonly kind: 'elsewhere'; readonly note?: string }
  /** Waiting for the editing tab to hand over; `slow` once it has had HAND_OVER_MS. */
  | { readonly kind: 'asking'; readonly slow: boolean }
  /** An opened folder the browser hasn't yet let the editor change. */
  | { readonly kind: 'ask-to-write' };

export interface EditTarget {
  /** The Web Lock that stands for the project (projectLock.ts). */
  readonly lockName: string;
  readonly copy: WorkingCopy;
  readonly write: (files: SavedFile[]) => Promise<void>;
  /** Finishes a save cut short, before editing starts; resolves to how many files it put right. */
  readonly recover?: () => Promise<number>;
  /** An opened folder: whether the editor may change it yet, and asking, which needs a tap. */
  readonly writable?: { readonly allowed: () => Promise<boolean>; readonly ask: () => Promise<boolean> };
  /**
   * After an edit, an undo, or another tab's save: re-read what shows the project. `paths` are the
   * files that changed; without them, any may have.
   */
  readonly changed: (paths?: readonly string[]) => void;
}

export interface EditingDeps {
  /** Null in a browser without Web Locks: editing works, without the guard. */
  readonly locks: Locks | null;
  readonly tabs: Tabs;
  readonly note: (text: string) => void;
  readonly after: (run: () => void, ms: number) => void;
}

export interface Editing {
  readonly access: Signal<Access>;
  readonly session: Signal<EditSession | null>;
  open(target: EditTarget): Promise<void>;
  /** Saves what it can, then lets the project go. */
  close(): Promise<void>;
  editHere(): Promise<void>;
  takeOver(): Promise<void>;
  /** Takes the lock again if it is free, quietly: after the browser let it go (Safari's back/forward cache). */
  retake(): Promise<void>;
  allowWriting(): Promise<void>;
  edit(label: string, make: (copy: WorkingCopy) => Promise<readonly FileChange[]>, group?: string): Promise<void>;
  undo(): Promise<Step | null>;
  redo(): Promise<Step | null>;
  /** Saves now, if editing; failures show in the save state. */
  flush(): Promise<void>;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What one tab knows about the open project's editing. */
interface State {
  readonly deps: EditingDeps;
  readonly access: Signal<Access>;
  readonly session: Signal<EditSession | null>;
  target: EditTarget | null;
  lock: HeldLock | null;
  /** Gives up an "Edit here" still waiting for the lock. */
  waiting: AbortController | null;
}

function begin(state: State, open: EditTarget): void {
  state.session.value = editSession({
    copy: open.copy,
    write: async (files) => {
      await open.write(files);
      state.deps.tabs.post({ kind: 'saved', lock: open.lockName, paths: files.map((file) => file.path) });
    },
    changed: (changes) => open.changed(changes.map((change) => change.path)),
  });
  state.access.value = { kind: 'editing' };
}

/**
 * Stops editing and lets the lock go; the project stays open, read only. Its edits are saved by
 * then, or dropped when another tab took over, so it reads the files again, and with them the
 * other tab's saves.
 */
function end(state: State, next: Access): void {
  state.session.value?.stop();
  state.session.value = null;
  state.target?.copy.forget();
  state.lock?.release();
  state.lock = null;
  state.access.value = next;
  // The edits laid over the files are gone, so what shows the project reads the files again.
  if (next.kind !== 'closed') state.target?.changed();
}

/** With the lock in hand (or no locks at all): finish any cut-short save, then edit. */
async function hold(state: State, open: EditTarget, held: HeldLock | null): Promise<void> {
  state.lock = held;
  void held?.lost.then(() => {
    if (state.lock !== held) return;
    // Whatever this tab hadn't saved is the taker's to redo; saving now would overwrite its work.
    state.lock = null;
    end(state, {
      kind: 'elsewhere',
      note: 'This tab stopped editing: another tab took over, or the browser let it go. Edits made here since the last save were not kept.',
    });
  });
  const finished = (await open.recover?.()) ?? 0;
  if (finished > 0) state.deps.note('Finished a save that was cut short.');
  // Opening has just read the project; a tab taking over reads what the other tab saved last.
  if (finished > 0 || state.access.value.kind !== 'closed') open.changed();
  if (open.writable && !(await open.writable.allowed())) state.access.value = { kind: 'ask-to-write' };
  else begin(state, open);
}

/** Another tab saved, asked this one to hand over, or couldn't hand over to this one. */
function hear(state: State, said: TabMessage): void {
  const open = state.target;
  const now = state.access.value.kind;
  if (!open || said.lock !== open.lockName) return;
  if (said.kind === 'saved' && now !== 'editing') open.changed(said.paths);
  if (said.kind === 'hand-over' && now === 'ask-to-write') end(state, { kind: 'elsewhere' });
  if (said.kind === 'hand-over' && now === 'editing') {
    // Saved first, so the other tab opens the files as this tab leaves them.
    void (state.session.value?.flush() ?? Promise.resolve()).then(
      () => end(state, { kind: 'elsewhere', note: 'Editing moved to another tab.' }),
      (error: unknown) => state.deps.tabs.post({ kind: 'refused', lock: said.lock, reason: message(error) }),
    );
  }
  if (said.kind === 'refused' && now === 'asking') {
    state.waiting?.abort();
    state.waiting = null;
    state.access.value = { kind: 'elsewhere', note: `The other tab couldn’t save its edits first: ${said.reason}` };
  }
}

/** "Edit here": asks the editing tab to hand over, and waits for the lock. */
async function editHere(state: State): Promise<void> {
  const open = state.target;
  const { locks, tabs, after } = state.deps;
  if (!open || !locks || state.access.value.kind !== 'elsewhere') return;
  const giveUp = new AbortController();
  state.waiting = giveUp;
  state.access.value = { kind: 'asking', slow: false };
  tabs.post({ kind: 'hand-over', lock: open.lockName });
  after(() => {
    if (state.waiting === giveUp && state.access.value.kind === 'asking')
      state.access.value = { kind: 'asking', slow: true };
  }, HAND_OVER_MS);
  const held = await takeLock(locks, open.lockName, { signal: giveUp.signal }).catch(() => null);
  if (state.waiting === giveUp) state.waiting = null;
  if (!held) return;
  if (state.target !== open) return held.release();
  await hold(state, open, held);
}

/** "Take over": the lock, from a tab that didn't answer. */
async function takeOver(state: State): Promise<void> {
  const open = state.target;
  if (!open || !state.deps.locks || state.access.value.kind !== 'asking') return;
  state.waiting?.abort();
  state.waiting = null;
  await hold(state, open, await takeLock(state.deps.locks, open.lockName, { steal: true }));
}

async function open(state: State, next: EditTarget): Promise<void> {
  state.target = next;
  if (!state.deps.locks) {
    state.deps.note('This browser can’t stop two tabs editing one project at once.');
    return hold(state, next, null);
  }
  const held = await takeLock(state.deps.locks, next.lockName, { ifAvailable: true });
  if (held) return hold(state, next, held);
  state.access.value = { kind: 'elsewhere' };
}

export function createEditing(deps: EditingDeps): Editing {
  const state: State = {
    deps,
    access: signal<Access>({ kind: 'closed' }),
    session: signal<EditSession | null>(null),
    target: null,
    lock: null,
    waiting: null,
  };
  deps.tabs.listen((said) => hear(state, said));
  let closing: Promise<void> = Promise.resolve();
  const close = (): Promise<void> => {
    closing = closing.then(async () => {
      state.waiting?.abort();
      state.waiting = null;
      await state.session.value
        ?.flush()
        .catch((error: unknown) => deps.note(`The last edits couldn’t be saved: ${message(error)}`));
      end(state, { kind: 'closed' });
      state.target = null;
    });
    return closing;
  };
  const travel = async (way: 'undo' | 'redo', said: string) => {
    const step = (await state.session.value?.[way]()) ?? null;
    if (step) deps.note(`${said}: ${step.label}.`);
    return step;
  };
  return {
    access: state.access,
    session: state.session,
    open: async (next) => {
      await close();
      await open(state, next);
    },
    close,
    editHere: () => editHere(state),
    takeOver: () => takeOver(state),
    retake: async () => {
      const opened = state.target;
      if (!opened || !deps.locks || state.access.value.kind !== 'elsewhere') return;
      const held = await takeLock(deps.locks, opened.lockName, { ifAvailable: true });
      if (held) await hold(state, opened, held);
      // Still another tab's: whatever it saved while this page was away went unheard.
      else opened.changed();
    },
    allowWriting: async () => {
      const opened = state.target;
      if (opened?.writable && state.access.value.kind === 'ask-to-write' && (await opened.writable.ask())) {
        begin(state, opened);
      }
    },
    edit: (label, make, group) => state.session.value?.edit(label, make, group) ?? Promise.resolve(),
    undo: () => travel('undo', 'Undone'),
    redo: () => travel('redo', 'Redone'),
    flush: () => state.session.value?.flush().catch(() => undefined) ?? Promise.resolve(),
  };
}
