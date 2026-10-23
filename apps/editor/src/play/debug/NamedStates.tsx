/**
 * Named states (M4.9, D59): the game in play kept as a save under a name the author types, in the
 * editor's own storage apart from the shell's slots, and restored or deleted from the list.
 */
import { createSaves, type SlotSummary, type Store } from '@eb/platform';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useUniqueId } from '../../app/ids.ts';
import { STATES_EDITION } from './protocol.ts';
import { debugBusy, debugSaid, keepState, restoreState } from './tools.ts';
import { slotOf } from './words.ts';

export function NamedStates({ store, game }: { store: Store; game: string }) {
  const id = useUniqueId();
  const saves = useMemo(() => createSaves({ store, game, edition: STATES_EDITION }), [store, game]);
  const [list, setList] = useState<readonly SlotSummary[]>([]);
  const [name, setName] = useState('');
  const [armed, setArmed] = useState<string | undefined>(undefined);
  const refresh = async () => setList(await saves.list());
  useEffect(() => {
    void refresh();
  }, [saves]);
  const busy = debugBusy.value;

  const keep = async () => {
    const slot = slotOf(name);
    if (!slot) {
      debugSaid.value = 'Give the state a name with a letter or a digit in it.';
      return;
    }
    const reply = await keepState();
    if (reply?.kind !== 'debug-kept') return;
    const written = await saves.write(slot, reply.save);
    debugSaid.value = written.ok ? `Kept as ${slot}.` : `Not kept: ${written.message}`;
    if (written.ok) setName('');
    await refresh();
  };
  const restore = async (slot: string) => {
    const raw = await saves.raw(slot);
    if (raw === undefined) debugSaid.value = `${slot} is gone.`;
    else await restoreState(raw, slot);
  };
  const remove = async (slot: string) => {
    if (armed !== slot) return setArmed(slot);
    setArmed(undefined);
    const removed = await saves.remove(slot);
    debugSaid.value = removed.ok ? `${slot} is deleted.` : `Not deleted: ${removed.message}`;
    await refresh();
  };

  return (
    <div class="debug-body">
      <div class="form-actions">
        <label for={id}>Name</label>
        <input
          id={id}
          class="field debug-name"
          value={name}
          onInput={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void keep();
          }}
        />
        <button type="button" class="button" disabled={busy || name.trim() === ''} onClick={() => void keep()}>
          Keep this state
        </button>
      </div>
      {list.length === 0 ? <p class="muted">No states kept yet.</p> : null}
      <ul class="debug-states">
        {list.map((entry) => (
          <li key={entry.slot} class="debug-state">
            <span>
              <strong>{entry.slot}</strong>
              {entry.readable && typeof entry.summary.turn === 'number' ? ` · step ${entry.summary.turn}` : ''}
            </span>
            <span class="form-actions">
              <button
                type="button"
                class="button"
                disabled={busy}
                onClick={() => void restore(entry.slot)}
                aria-label={`Restore ${entry.slot}`}
              >
                Restore
              </button>
              <button
                type="button"
                class="button"
                onClick={() => void remove(entry.slot)}
                aria-label={armed === entry.slot ? `Press again to delete ${entry.slot}` : `Delete ${entry.slot}`}
              >
                {armed === entry.slot ? 'Press again to delete' : 'Delete'}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
