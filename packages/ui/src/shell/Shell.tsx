/**
 * The play shell (M4.3, D53, docs/specs/shell.md): what a game is played inside, drawn by the
 * engine in the game's theme. Its screens sit in a box of their own, over the game while it is
 * paused, and keys, a pad and swipes move through them as through a game's screens. The game's
 * own screens are GameScreens', untouched.
 */
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { useAudio } from '../audio/useAudio.ts';
import { shellSettings } from '../format/shell.ts';
import { useInput } from '../input/useInput.ts';
import { GameScreens } from '../render/GameScreens.tsx';
import { themeVars } from '../render/layout.ts';
import { showCrash, watchCrashes } from './crash.ts';
import { Fallen } from './Fallen.tsx';
import { NewGame } from './NewGame.tsx';
import { Pause } from './Pause.tsx';
import { SavesScreen } from './SavesScreen.tsx';
import { SettingsScreen } from './SettingsScreen.tsx';
import type { ScreenMemory } from './ShellScreen.tsx';
import { Stopped } from './Stopped.tsx';
import { settingsAttrs } from './settings.ts';
import { slotName } from './slots.ts';
import { Title } from './Title.tsx';
import type { ShellProps } from './types.ts';
import { useSettings } from './useSettings.ts';
import { type ShellState, useShell } from './useShell.ts';
import './shell.css';

export function Shell(props: ShellProps) {
  const { opened, store, edition } = props;
  const state = useShell(props);
  const [settings, change] = useSettings(store, opened.game, edition);
  const audio = useAudio(opened.audio, opened.theme?.sounds, settings);
  // Out of play, on the shell's title or after a game stops, nothing plays.
  useEffect(() => {
    if (!state.play) audio.setMix({ levels: {} });
  }, [audio, state.play === undefined]);
  const box = useRef<HTMLDivElement>(null);
  const memory = useMemo<ScreenMemory>(() => new Map(), [opened]);
  const { screen, play } = state;
  const back = backFrom(state);
  const input = useInput(box, { back, on: screen !== undefined });
  const context = () => ({
    game: opened.game,
    build: opened.build,
    ...(play ? { slot: play.slot, turn: play.view.turn, raw: () => state.saves.raw(play.slot) } : {}),
  });
  const latest = useRef(context);
  latest.current = context;
  useEffect(() => (props.crashes ? watchCrashes(() => latest.current()) : undefined), [props.crashes]);
  useEffect(() => {
    if (props.crashes && state.stopped !== undefined) showCrash(state.stopped, latest.current());
  }, [state.stopped]);
  const attrs = settingsAttrs(settings);
  return (
    <div
      class="eb-shell"
      style={{ ...themeVars(opened.theme), ...attrs.style }}
      data-motion={attrs['data-motion']}
      data-shell-screen={screen ?? 'play'}
    >
      {play ? (
        <header class="eb-shell-bar">
          <p class="eb-text eb-shell-bar-name">{`${shellSettings(opened.shell, opened.name).title} · ${slotName(play.slot)}`}</p>
          {state.notice ? (
            <p class="eb-text eb-shell-bar-notice" role="status">
              {state.notice}
            </p>
          ) : null}
          <button
            type="button"
            class="eb-button eb-shell-pause"
            disabled={screen !== undefined}
            onClick={() => state.show('pause')}
          >
            Pause
          </button>
        </header>
      ) : null}
      <div class="eb-shell-body">
        {play ? (
          <GameScreens
            screens={opened.screens}
            theme={opened.theme}
            view={play.view}
            said={play.said}
            audio={audio}
            cues={play.cues}
            busy={state.acting}
            act={state.act}
            send={state.send}
            spaces={props.spaces}
            quality={settings.quality}
            markers={settings.markers}
            history={props.history === true && screen === undefined}
            onPause={() => state.show('pause')}
            paused={screen !== undefined}
            onShell={(go) => {
              // The slot was saved at the last step, so nothing is lost by leaving.
              state.quit();
              if (go === 'new') state.show('new');
            }}
          />
        ) : null}
        <div
          class={`eb-shell-screens${play && (screen === 'pause' || screen === 'fallen') ? ' eb-shell-over' : ''}`}
          ref={box}
          hidden={screen === undefined}
          data-input={input.device}
        >
          {screen === undefined ? null : (
            <ShellScreenFor {...props} state={state} memory={memory} back={back} settings={settings} change={change} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Where Back goes from each of the shell's screens: none from the title. */
function backFrom(state: ShellState): (() => void) | undefined {
  switch (state.screen) {
    case 'new':
    case 'saves':
    case 'settings':
      return () => state.show(state.play ? 'pause' : 'title');
    case 'pause':
      return () => state.show(undefined);
    default:
      return undefined;
  }
}

type ForProps = ShellProps & {
  readonly state: ShellState;
  readonly memory: ScreenMemory;
  readonly back: (() => void) | undefined;
  readonly settings: ReturnType<typeof useSettings>[0];
  readonly change: ReturnType<typeof useSettings>[1];
};

function ShellScreenFor({ state, memory, back, opened, update, settings, change, spaces }: ForProps) {
  const leave = back ?? (() => state.show('title'));
  switch (state.screen) {
    case 'new':
      return <NewGame state={state} opened={opened} memory={memory} back={leave} />;
    case 'saves':
      return <SavesScreen state={state} opened={opened} memory={memory} back={leave} />;
    case 'settings':
      return (
        <SettingsScreen
          settings={settings}
          change={change}
          memory={memory}
          back={leave}
          walks={opened.world !== undefined}
        />
      );
    case 'pause':
      return <Pause state={state} memory={memory} />;
    case 'stopped':
      return <Stopped state={state} opened={opened} memory={memory} />;
    case 'fallen':
      return <Fallen state={state} memory={memory} name={(space) => spaces?.name(space)} />;
    default:
      return <Title state={state} opened={opened} memory={memory} update={update} />;
  }
}
