/**
 * A game's screens drawn from its view (M4.1, D51): the stack worked out from the game's modes
 * and the screens buttons opened, the drawn part of it, the theme as CSS variables, and the
 * breakpoint from the game's own box. Each step's view comes from the worker; this draws it and
 * sends back actions. M4.2 adds what the step said, as toasts, the log and the announcer, and the
 * keys, gamepad and swipes that drive it (useInput.ts).
 */
import { type Action, canonicalJson } from '@eb/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { mixOf } from '../audio/mix.ts';
import type { AudioPlayer } from '../audio/player.ts';
import type { Cue } from '../format/audio.ts';
import type { Said } from '../format/feedback.ts';
import type { Breakpoint, Screen, ShellGo } from '../format/screen.ts';
import type { Theme } from '../format/theme.ts';
import { useBackHistory } from '../input/useBackHistory.ts';
import { useInput } from '../input/useInput.ts';
import type { View } from '../session/types.ts';
import type { Drawing } from './context.ts';
import { Announcer, ToastView, useFeedback } from './Feedback.tsx';
import { breakpointOf, themeVars } from './layout.ts';
import { ScreenView } from './Screen.tsx';
import type { Sent, SpaceHost, WalkQuality } from './spaceHost.ts';
import { drawn, type Opened, type Shown, screenStack, stillOpen } from './stack.ts';
import './screens.css';
import './map.css';
import './spaceMap.css';

export interface GameScreensProps {
  readonly screens: Readonly<Record<string, Screen>>;
  readonly theme?: Theme;
  readonly view: View;
  readonly busy?: boolean;
  act(action: Action): void;
  readonly assetUrl?: (path: string) => string | undefined;
  /** What the last step said (M4.2): a new array each step, however few its lines. */
  readonly said?: readonly Said[];
  /** The browser's back closes a screen a button opened: the player page's, not the editor's (M4.2). */
  readonly history?: boolean;
  /** The shell's pause (M4.3): Escape and B with no screen to close, and a pad's Start. */
  readonly onPause?: () => void;
  /** The shell's pause is over the game: it takes no input and nothing in it takes focus. */
  readonly paused?: boolean;
  /** Where a button's `{"shell": …}` goes (M4.4): without it, such buttons are disabled. */
  readonly onShell?: (go: ShellGo) => void;
  /** The page's audio (M4.8): it follows the stack's mix, plays each step's cues and the interface's sounds. */
  readonly audio?: AudioPlayer;
  /** The last step's sounds and buzzes: a new array each step. */
  readonly cues?: readonly Cue[];
  /** Who draws Space widgets' spaces (M5.8): the page's stage, for a pack with spaces. */
  readonly spaces?: SpaceHost | undefined;
  /** Sends the stage's triggers, answering what the sim made of each (M5.8). */
  readonly send?: (action: Action) => Promise<Sent>;
  readonly quality?: WalkQuality;
  /** The shell's Quest markers setting (M6.6): off hides the walk's compass and markers. */
  readonly markers?: boolean;
}

const NOTHING: readonly Said[] = [];
const NO_CUES: readonly Cue[] = [];

/** The game's box, measured as it changes: its breakpoint. */
function useBreakpoint(box: { readonly current: HTMLElement | null }): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('phone');
  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => setBreakpoint(breakpointOf(element.clientWidth, element.clientHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [box]);
  return breakpoint;
}

/** The audio follows the stack's mix as it changes, and plays each step's cues once (M4.8). */
function useScreenAudio(audio: AudioPlayer | undefined, stack: readonly Shown[], view: View, cues: readonly Cue[]) {
  const onStack = stack.flatMap((each) => (each.kind === 'screen' ? [each.screen] : []));
  const mix = audio ? mixOf(onStack, view.conditions, audio.audio) : undefined;
  const key = mix ? canonicalJson(mix as never) : '';
  // The mix is followed when what it holds changes, not each render.
  useEffect(() => {
    if (audio && mix) audio.setMix(mix);
  }, [audio, key]);
  useEffect(() => {
    if (audio && cues.length > 0) audio.cue(cues);
  }, [audio, cues]);
}

export function GameScreens(props: GameScreensProps) {
  const { screens, theme, view, busy = false, act, assetUrl, said = NOTHING, history = false, paused = false } = props;
  const box = useRef<HTMLDivElement>(null);
  const breakpoint = useBreakpoint(box);
  // Screens a button opened belong to the modes they were opened in: a step that changes the modes closes them.
  const { modes } = view;
  const [opened, setOpened] = useState<Opened>({ modes, ids: [] });
  const ids = stillOpen(opened, modes);
  const stack = screenStack(screens, view.modes, ids);
  const shown = drawn(stack);
  const { audio, cues = NO_CUES } = props;
  useScreenAudio(audio, stack, view, cues);
  const close =
    ids.length === 0
      ? undefined
      : () => {
          audio?.ui('back');
          setOpened({ modes, ids: ids.slice(0, -1) });
        };
  useBackHistory(
    ids.length,
    (depth) => setOpened((was) => ({ modes: was.modes, ids: was.ids.slice(0, depth) })),
    history,
  );
  const fed = useFeedback(said);
  const input = useInput(box, { back: close, pause: props.onPause, on: !paused });
  const drawing: Drawing = {
    view,
    breakpoint,
    busy,
    act: (action) => {
      audio?.ui('press');
      act(action);
    },
    open: (id) => {
      audio?.ui('open');
      setOpened({ modes, ids: [...ids, id] });
    },
    close,
    assetUrl: (path) => assetUrl?.(path),
    log: fed.log,
    paused,
    toShell: props.onShell,
    spaces: props.spaces,
    send: props.send,
    ...(props.quality ? { quality: props.quality } : {}),
    ...(props.markers === false ? { markers: false } : {}),
  };
  return (
    // The turn and whether a step is on its way, for a test or a stage to wait on.
    <div
      class={`eb-game eb-at-${breakpoint}`}
      ref={box}
      style={themeVars(theme)}
      data-turn={view.turn}
      data-busy={busy ? 'true' : undefined}
      data-input={input.device}
      inert={paused ? true : undefined}
    >
      {shown.map((each, i) => (
        <ScreenView
          key={each.kind === 'screen' ? `screen:${each.id}:${i}` : `mode:${each.mode}:${i}`}
          shown={each}
          top={i === shown.length - 1}
          drawing={drawing}
          remembered={input.remembered}
        />
      ))}
      <ToastView toast={fed.toast} />
      <Announcer spoken={fed.spoken} />
    </div>
  );
}
