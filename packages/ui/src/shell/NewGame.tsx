/**
 * New (M4.3): the numbered slots. An empty one starts a game at once; a full one asks again, naming
 * what it holds, and its save goes to the slot's backup.
 */
import { shellSettings } from '../format/shell.ts';
import { type ScreenMemory, ShellScreen } from './ShellScreen.tsx';
import { slotIds, slotName } from './slots.ts';
import type { OpenedGame } from './types.ts';
import { useSecondPress } from './useSecondPress.ts';
import type { ShellState } from './useShell.ts';

interface NewGameProps {
  readonly state: ShellState;
  readonly opened: OpenedGame;
  readonly memory: ScreenMemory;
  readonly back: () => void;
}

export function NewGame({ state, opened, memory, back }: NewGameProps) {
  const { slots } = shellSettings(opened.shell, opened.name);
  const second = useSecondPress();
  const held = new Map((state.slots ?? []).map((info) => [info.slot, info]));
  return (
    <ShellScreen
      name="new"
      title="New game"
      memory={memory}
      bottom={
        <button type="button" class="eb-button" data-key="back" onClick={back}>
          Back
        </button>
      }
    >
      <p class="eb-text eb-caption">Choose a slot. The game saves there after every step.</p>
      <ul class="eb-list">
        {slotIds(slots).map((slot) => {
          const info = held.get(slot);
          const shown = info === undefined ? 'Empty' : info.readable ? info.line : 'A save that can’t be read';
          const armed = second.armed === slot;
          return (
            <li key={slot}>
              <button
                type="button"
                class="eb-button eb-plain"
                data-key={slot}
                disabled={state.busy}
                onClick={() =>
                  info === undefined ? void state.begin(slot) : second.press(slot, () => void state.begin(slot))
                }
              >
                {armed ? `Press again to replace ${slotName(slot)}` : slotName(slot)}
                <span class="eb-shell-detail">{shown}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p class="eb-sr" role="status">
        {second.armed ? `Press again to start over ${slotName(second.armed)}. Its save goes to the slot’s backup.` : ''}
      </p>
    </ShellScreen>
  );
}
