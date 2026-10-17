import { editing, redoLabel, undoLabel } from '../editing/current.ts';
import { current } from '../projects/session.ts';
import { HistoryIcon } from './icons.tsx';

/** The top bar's Undo and Redo, while a project is open. Each names the step it would take. */
export function UndoButtons() {
  if (!current.value) return null;
  const canEdit = editing.access.value.kind === 'editing';
  return (
    <>
      <HistoryButton way="undo" label={undoLabel.value} enabled={canEdit} />
      <HistoryButton way="redo" label={redoLabel.value} enabled={canEdit} />
    </>
  );
}

function HistoryButton({ way, label, enabled }: { way: 'undo' | 'redo'; label: string | null; enabled: boolean }) {
  const name = way === 'undo' ? 'Undo' : 'Redo';
  const said = label ? `${name}: ${label}` : name;
  return (
    <button
      type="button"
      class="icon-button"
      aria-label={said}
      title={said}
      aria-keyshortcuts={way === 'undo' ? 'Control+Z Meta+Z' : 'Control+Shift+Z Meta+Shift+Z Control+Y'}
      disabled={!enabled || !label}
      onClick={() => void editing[way]()}
    >
      <HistoryIcon way={way} />
    </button>
  );
}
