/**
 * The title (M4.3, docs/specs/shell.md#the-title): Continue the slot played last, New, the Daily
 * when the game has one, Saves and Settings; and, here only, a new version of the page to load.
 */
import { shellSettings } from '../format/shell.ts';
import { type ScreenMemory, ShellScreen } from './ShellScreen.tsx';
import { DAILY_SLOT, slotName } from './slots.ts';
import type { OpenedGame, ShellProps } from './types.ts';
import type { ShellState } from './useShell.ts';

interface TitleProps {
  readonly state: ShellState;
  readonly opened: OpenedGame;
  readonly memory: ScreenMemory;
  readonly update: ShellProps['update'];
}

export function Title({ state, opened, memory, update }: TitleProps) {
  const shell = shellSettings(opened.shell, opened.name);
  const going = state.continueSlot;
  const today = state.dailyToday();
  const daily = state.slots?.find((info) => info.slot === DAILY_SLOT);
  const dailyGoesOn = daily?.readable === true && daily.daily === today;
  const button = (primary: boolean) => `eb-button${primary ? ' eb-primary' : ''}`;
  return (
    <ShellScreen name="title" title={shell.title} memory={memory}>
      {shell.tagline ? <p class="eb-text eb-caption eb-shell-tagline">{shell.tagline}</p> : null}
      <div class="eb-shell-actions">
        {going ? (
          <button
            type="button"
            class={button(true)}
            data-key="continue"
            disabled={state.busy}
            onClick={() => void state.resume(going.slot)}
          >
            Continue
            <span class="eb-shell-detail">{`${slotName(going.slot)} · ${going.line}`}</span>
          </button>
        ) : null}
        <button
          type="button"
          class={button(!going)}
          data-key="new"
          disabled={state.busy}
          onClick={() => state.show('new')}
        >
          New game
        </button>
        {shell.daily ? (
          <button type="button" class={button(false)} data-key="daily" disabled={state.busy} onClick={state.daily}>
            {`Daily ${today}`}
            <span class="eb-shell-detail">
              {dailyGoesOn ? `Go on · ${daily.line}` : 'Today’s game, the same for everyone'}
            </span>
          </button>
        ) : null}
        <button type="button" class={button(false)} data-key="saves" onClick={() => state.show('saves')}>
          Saves
        </button>
        <button type="button" class={button(false)} data-key="settings" onClick={() => state.show('settings')}>
          Settings
        </button>
      </div>
      {state.notice ? (
        <p class="eb-text eb-shell-notice" role="status">
          {state.notice}
        </p>
      ) : null}
      {update?.ready ? (
        <div class="eb-panel eb-shell-update" role="status">
          <p class="eb-text">A new version is ready. Every game is saved, so nothing is lost.</p>
          <button type="button" class="eb-button eb-primary" data-key="update" onClick={update.apply}>
            Reload to update
          </button>
        </div>
      ) : null}
    </ShellScreen>
  );
}
