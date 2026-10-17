/**
 * Ctrl/⌘+Z undoes and Ctrl/⌘+Shift+Z or Ctrl+Y redoes, anywhere but in a text field that isn't
 * the project's own: the palette's field, a picker's search or the new project's name keep the
 * browser's own undo. In the project's fields (its name and version, and since M2.4 the boxes of
 * record forms) the editor's undo takes over, from the keys and from the Edit menu or a shake
 * (`beforeinput`), so field and project never disagree.
 */
import { editing } from '../editing/current.ts';

const PROJECT_FIELD = '[data-project-field]';
const NOT_TEXT = new Set(['button', 'checkbox', 'color', 'file', 'radio', 'range', 'reset', 'submit']);

function keepsOwnUndo(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement) || target.closest(PROJECT_FIELD)) return false;
  if (target instanceof HTMLInputElement) return !NOT_TEXT.has(target.type);
  return target instanceof HTMLTextAreaElement || target.isContentEditable;
}

/** 'undo', 'redo', or null for any other key. */
export function undoKey(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
): 'undo' | 'redo' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  // Ctrl+Y is redo on Windows and Linux; ⌘Y means other things on a Mac.
  if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) return 'redo';
  return null;
}

export function watchUndoKeys(): void {
  document.addEventListener('keydown', (event) => {
    const way = undoKey(event);
    if (!way || keepsOwnUndo(event.target)) return;
    event.preventDefault();
    void editing[way]();
  });
  document.addEventListener(
    'beforeinput',
    (event) => {
      const way = event.inputType === 'historyUndo' ? 'undo' : event.inputType === 'historyRedo' ? 'redo' : null;
      if (!way || !(event.target instanceof HTMLElement) || !event.target.closest(PROJECT_FIELD)) return;
      event.preventDefault();
      void editing[way]();
    },
    true,
  );
}
