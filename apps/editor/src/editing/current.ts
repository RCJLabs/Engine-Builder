/**
 * The editor's one Editing (projectEditing.ts), with the browser's locks and channel, and the
 * page's moments to save: when it is hidden, which on a phone may be the last moment it gets,
 * and before it unloads, when the browser may ask whether to leave unsaved edits.
 */
import { computed } from '@preact/signals';
import { note } from '../app/state.ts';
import { createEditing } from './projectEditing.ts';
import { browserLocks } from './projectLock.ts';
import { browserTabs } from './tabs.ts';

export const editing = createEditing({
  locks: browserLocks(),
  tabs: browserTabs(),
  note,
  after: (run, ms) => void setTimeout(run, ms),
});

/** True while an edit isn't yet written, or not yet even made: the update toast waits, and leaving asks first. */
export const unsaved = computed(() => {
  const session = editing.session.value;
  return session !== null && (session.pending.value > 0 || session.saveState.value.kind !== 'saved');
});

/** The labels of the steps undo and redo would take, or null when there are none. */
export const undoLabel = computed(() => editing.session.value?.history.value.past.at(-1)?.label ?? null);
export const redoLabel = computed(() => editing.session.value?.history.value.future.at(-1)?.label ?? null);

export function watchPage(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void editing.flush();
  });
  // A second chance where visibilitychange doesn't come before the page goes (older Safari).
  window.addEventListener('pagehide', () => void editing.flush());
  window.addEventListener('beforeunload', (event) => {
    if (!unsaved.value) return;
    void editing.flush();
    event.preventDefault();
  });
}
