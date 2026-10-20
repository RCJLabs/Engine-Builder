/**
 * A game that stopped, shown in place where a crash screen mustn't cover the page: the editor's Play
 * panel (M4.3). What failed, the save as stored, and the way back to the title.
 */
import { saveText } from './files.ts';
import { type ScreenMemory, ShellScreen } from './ShellScreen.tsx';
import type { OpenedGame } from './types.ts';
import type { ShellState } from './useShell.ts';

interface StoppedProps {
  readonly state: ShellState;
  readonly opened: OpenedGame;
  readonly memory: ScreenMemory;
}

export function Stopped({ state, opened, memory }: StoppedProps) {
  const slot = state.play?.slot;
  const saveFile = async () => {
    const raw = slot === undefined ? undefined : await state.saves.raw(slot);
    if (raw !== undefined) saveText(`${opened.game}-${slot}.save.json`, raw);
  };
  return (
    <ShellScreen
      name="stopped"
      title="The game stopped"
      memory={memory}
      bottom={
        <button type="button" class="eb-button eb-primary" data-key="title" onClick={state.quit}>
          Back to the title
        </button>
      }
    >
      <p class="eb-text">Something went wrong, and the game can’t go on. It was saved after its last step.</p>
      <p class="eb-text eb-shell-notice">{state.stopped}</p>
      {slot !== undefined ? (
        <button type="button" class="eb-button" data-key="save-file" onClick={() => void saveFile()}>
          Save file
        </button>
      ) : null}
    </ShellScreen>
  );
}
