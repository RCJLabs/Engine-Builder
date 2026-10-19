/**
 * A game's screens drawn from its view (M4.1, D51): the stack worked out from the game's modes
 * and the screens buttons opened, the drawn part of it, the theme as CSS variables, and the
 * breakpoint from the game's own box. Each step's view comes from the worker; this draws it and
 * sends back actions. M4.2 adds what the step said, as toasts, the log and the announcer, and the
 * keys, gamepad and swipes that drive it (useInput.ts).
 */
import type { Action } from '@eb/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Said } from '../format/feedback.ts';
import type { Breakpoint, Screen } from '../format/screen.ts';
import type { Theme } from '../format/theme.ts';
import { useBackHistory } from '../input/useBackHistory.ts';
import { useInput } from '../input/useInput.ts';
import type { View } from '../session/types.ts';
import type { Drawing } from './context.ts';
import { Announcer, ToastView, useFeedback } from './Feedback.tsx';
import { breakpointOf, themeVars } from './layout.ts';
import { ScreenView } from './Screen.tsx';
import { drawn, type Opened, screenStack, stillOpen } from './stack.ts';
import './screens.css';

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
}

const NOTHING: readonly Said[] = [];

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

export function GameScreens(props: GameScreensProps) {
  const { screens, theme, view, busy = false, act, assetUrl, said = NOTHING, history = false } = props;
  const box = useRef<HTMLDivElement>(null);
  const breakpoint = useBreakpoint(box);
  // Screens a button opened belong to the modes they were opened in: a step that changes the modes closes them.
  const { modes } = view;
  const [opened, setOpened] = useState<Opened>({ modes, ids: [] });
  const ids = stillOpen(opened, modes);
  const shown = drawn(screenStack(screens, view.modes, ids));
  const close = ids.length === 0 ? undefined : () => setOpened({ modes, ids: ids.slice(0, -1) });
  useBackHistory(
    ids.length,
    (depth) => setOpened((was) => ({ modes: was.modes, ids: was.ids.slice(0, depth) })),
    history,
  );
  const fed = useFeedback(said);
  const input = useInput(box, close);
  const drawing: Drawing = {
    view,
    breakpoint,
    busy,
    act,
    open: (id) => setOpened({ modes, ids: [...ids, id] }),
    close,
    assetUrl: (path) => assetUrl?.(path),
    log: fed.log,
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
