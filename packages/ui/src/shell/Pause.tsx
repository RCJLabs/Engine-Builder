/**
 * Pause (M4.3, docs/specs/shell.md#pause): over the game, which takes no input behind it. The slot
 * was saved at the last step, so Quit to title loses nothing. The sim isn't told: a game that steps
 * when the player acts has nothing running to stop.
 */
import { type ScreenMemory, ShellScreen } from './ShellScreen.tsx';
import type { ShellState } from './useShell.ts';

export function Pause({ state, memory }: { readonly state: ShellState; readonly memory: ScreenMemory }) {
  return (
    <ShellScreen name="pause" title="Paused" memory={memory} modal>
      <div class="eb-shell-actions">
        <button type="button" class="eb-button eb-primary" data-key="resume" onClick={() => state.show(undefined)}>
          Resume
        </button>
        <button type="button" class="eb-button" data-key="saves" onClick={() => state.show('saves')}>
          Saves
        </button>
        <button type="button" class="eb-button" data-key="settings" onClick={() => state.show('settings')}>
          Settings
        </button>
        <button type="button" class="eb-button" data-key="quit" onClick={state.quit}>
          Quit to title
        </button>
      </div>
      <p class="eb-text eb-caption">The game saved after your last step.</p>
    </ShellScreen>
  );
}
