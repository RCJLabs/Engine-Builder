import { useEffect, useState } from 'preact/hooks';
import { editing } from './current.ts';

/**
 * Text typed into a field, shown at once while its edit lands a moment later. It goes once the
 * stored value has caught up, when undo or redo moves the value (they leave the history closed),
 * or when the field is left (`clear`).
 *
 * "Caught up" is checked against the draft as it is now, not as it was when the stored value
 * changed: a key pressed in between would otherwise be wiped from the field (M2.4, seen losing
 * the "n" of "trident" typed into a new list item).
 */
export function useDraft(stored: string) {
  const [draft, setDraft] = useState<string | null>(null);
  const history = editing.session.value?.history.value;
  // Not run on each keystroke: the first one after an undo would be wiped before its edit lands.
  useEffect(() => {
    if (history && !history.open) setDraft(null);
    else setDraft((now) => (now === stored ? null : now));
  }, [stored, history]);
  return { shown: draft ?? stored, draft, setDraft, clear: () => setDraft(null) };
}
