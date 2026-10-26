/**
 * Fallen (M6.4, D76, docs/specs/combat.md#a-fall): over the game when the player falls, which takes
 * nothing behind it. Back to the slot's checkpoint, the save made as they came into a space, or as
 * the game began or loaded, named by where it goes; or to the title. The fatal step's save is the
 * slot's own until then, so leaving for the title and coming back finds them fallen still.
 */
import { type ScreenMemory, ShellScreen } from './ShellScreen.tsx';
import type { ShellState } from './useShell.ts';

interface FallenProps {
  readonly state: ShellState;
  readonly memory: ScreenMemory;
  /** A space's name, for where the checkpoint goes back to. */
  readonly name: (space: string) => string | undefined;
}

export function Fallen({ state, memory, name }: FallenProps) {
  const kept = state.checkpoint;
  const where = kept?.space === undefined ? undefined : (name(kept.space) ?? kept.space);
  return (
    <ShellScreen name="fallen" title="You have fallen" memory={memory} modal>
      <div class="eb-shell-actions">
        {kept ? (
          <button
            type="button"
            class="eb-button eb-primary"
            data-key="checkpoint"
            disabled={state.busy}
            onClick={() => void state.rise()}
          >
            {where === undefined ? 'Back to the checkpoint' : `Back to ${where}`}
          </button>
        ) : null}
        <button type="button" class={`eb-button${kept ? '' : ' eb-primary'}`} data-key="title" onClick={state.quit}>
          Back to the title
        </button>
      </div>
      <p class="eb-text eb-caption">
        {kept ? 'The checkpoint is where you last came into a place.' : 'There is no checkpoint to go back to.'}
      </p>
    </ShellScreen>
  );
}
