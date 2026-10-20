/**
 * Saves set aside (M4.3): the copies quarantine kept of saves that wouldn't load, or that an update
 * or another tab would have lost, each with why. The player saves one out, then may delete it on a
 * second press: nothing else ever removes one.
 */
import type { Quarantined } from '@eb/platform';
import { useEffect, useState } from 'preact/hooks';
import { saveText } from './files.ts';
import { slotName } from './slots.ts';
import type { OpenedGame } from './types.ts';
import { useSecondPress } from './useSecondPress.ts';
import type { ShellState } from './useShell.ts';

export function SetAside({ state, opened }: { readonly state: ShellState; readonly opened: OpenedGame }) {
  const [kept, setKept] = useState<readonly Quarantined[]>([]);
  const [said, setSaid] = useState<string | undefined>(undefined);
  const second = useSecondPress();
  const refresh = async () => setKept(await state.saves.quarantined());
  useEffect(() => {
    void refresh();
  }, [state.slots]);
  if (kept.length === 0) return null;
  const forget = (entry: Quarantined) =>
    second.press(entry.key, async () => {
      const removed = await state.saves.forget(entry.key);
      setSaid(removed.ok ? 'Deleted.' : `Not deleted: ${removed.message}`);
      await refresh();
    });
  return (
    <section class="eb-shell-part" aria-label="Set aside">
      <h3 class="eb-text eb-heading">Set aside</h3>
      <p class="eb-text eb-caption">
        Copies kept of saves that wouldn’t load or were about to be lost. Save one out before you delete it.
      </p>
      <ul class="eb-list">
        {kept.map((entry, i) => (
          <li key={entry.key} class="eb-panel eb-shell-save">
            <p class="eb-text">{`${slotName(entry.slot)}: ${entry.message}`}</p>
            <div class="eb-shell-row">
              <button
                type="button"
                class="eb-button"
                data-key={`aside-file:${entry.key}`}
                onClick={() => saveText(`${opened.game}-${entry.slot}-set-aside-${i + 1}.save.json`, entry.raw)}
              >
                Save file
              </button>
              <button
                type="button"
                class="eb-button"
                data-key={`aside-delete:${entry.key}`}
                onClick={() => forget(entry)}
              >
                {second.armed === entry.key ? 'Press again to delete' : 'Delete'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p class="eb-text eb-shell-notice" role="status">
        {second.armed ? 'Press again to delete it. It can’t be undone.' : (said ?? '')}
      </p>
    </section>
  );
}
