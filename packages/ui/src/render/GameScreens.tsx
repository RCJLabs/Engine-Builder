/**
 * A game's screens drawn from its view (M4.1, D51): the stack worked out from the game's modes
 * and the screens buttons opened, the drawn part of it, the theme as CSS variables, and the
 * breakpoint from the game's own box. The top screen takes focus and taps; those under it are
 * inert. Each step's view comes from the worker; this draws it and sends back actions.
 */
import type { Action } from '@eb/core';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Breakpoint, Screen } from '../format/screen.ts';
import type { Theme } from '../format/theme.ts';
import type { View } from '../session/types.ts';
import { type Drawing, freshId } from './context.ts';
import { breakpointOf, themeVars } from './layout.ts';
import { drawn, type Shown, screenStack } from './stack.ts';
import { WidgetView } from './Widget.tsx';
import './screens.css';

export interface GameScreensProps {
  readonly screens: Readonly<Record<string, Screen>>;
  readonly theme?: Theme;
  readonly view: View;
  readonly busy?: boolean;
  act(action: Action): void;
  readonly assetUrl?: (path: string) => string | undefined;
}

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

export function GameScreens({ screens, theme, view, busy = false, act, assetUrl }: GameScreensProps) {
  const box = useRef<HTMLDivElement>(null);
  const breakpoint = useBreakpoint(box);
  // Screens a button opened belong to the modes they were opened in: a step that changes the modes closes them.
  const modes = view.modes.join('\n');
  const [opened, setOpened] = useState<{ readonly modes: string; readonly ids: readonly string[] }>({ modes, ids: [] });
  const ids = opened.modes === modes ? opened.ids : [];
  const shown = drawn(screenStack(screens, view.modes, ids));
  const drawing: Drawing = {
    view,
    breakpoint,
    busy,
    act,
    open: (id) => setOpened({ modes, ids: [...ids, id] }),
    close: ids.length === 0 ? undefined : () => setOpened({ modes, ids: ids.slice(0, -1) }),
    assetUrl: (path) => assetUrl?.(path),
  };
  return (
    // The turn and whether a step is on its way, for a test or a stage to wait on.
    <div
      class={`eb-game eb-at-${breakpoint}`}
      ref={box}
      style={themeVars(theme)}
      data-turn={view.turn}
      data-busy={busy ? 'true' : undefined}
    >
      {shown.map((each, i) => (
        <ScreenView
          key={each.kind === 'screen' ? `screen:${each.id}:${i}` : `mode:${each.mode}:${i}`}
          shown={each}
          top={i === shown.length - 1}
          drawing={drawing}
        />
      ))}
    </div>
  );
}

interface ScreenProps {
  readonly shown: Shown;
  readonly top: boolean;
  readonly drawing: Drawing;
}

function ScreenView({ shown, top, drawing }: ScreenProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useMemo(() => freshId('screen'), []);
  const modal = shown.kind === 'screen' && shown.screen.modal === true;
  const wasTop = useRef(false);
  // A screen that comes to the top while the player is in the game is announced by its heading,
  // and keys start from it. So does a step that left focus nowhere, as a button that went does.
  useEffect(() => {
    const element = heading.current;
    const became = top && !wasTop.current;
    wasTop.current = top;
    if (!top || !element) return;
    const active = document.activeElement;
    const lost = active === null || active === document.body;
    if (lost || (became && element.closest('.eb-game')?.contains(active))) element.focus({ preventScroll: true });
  }, [top, drawing.view]);
  const title = shown.kind === 'screen' ? (shown.screen.title ?? shown.id) : shown.mode;
  return (
    <section
      class={`eb-screen${modal ? ' eb-modal' : ''}`}
      inert={top ? undefined : true}
      {...(modal && top ? { role: 'dialog', 'aria-modal': 'true' } : {})}
      aria-labelledby={id}
    >
      <div class="eb-sheet">
        <h2 class="eb-sr" id={id} tabIndex={-1} ref={heading}>
          {title}
        </h2>
        {shown.kind === 'screen' ? <Regions screen={shown.screen} drawing={drawing} /> : <Fallback drawing={drawing} />}
      </div>
    </section>
  );
}

function Regions({ screen, drawing }: { readonly screen: Screen; readonly drawing: Drawing }) {
  return (
    <>
      {screen.top && (
        <div class="eb-region eb-top">
          <WidgetView widget={screen.top} drawing={drawing} />
        </div>
      )}
      <div class="eb-region eb-main">
        <WidgetView widget={screen.main} drawing={drawing} />
      </div>
      {screen.bottom && (
        <div class="eb-region eb-bottom">
          <WidgetView widget={screen.bottom} drawing={drawing} />
        </div>
      )}
    </>
  );
}

/** A mode no screen shows: every action on offer as a button, so the game can still be played. */
function Fallback({ drawing }: { readonly drawing: Drawing }) {
  const offered = drawing.view.lists.offered ?? [];
  return (
    <div class="eb-region eb-main">
      {offered.length === 0 ? (
        <p class="eb-text eb-empty">Nothing to do: the game is over.</p>
      ) : (
        <ul class="eb-list">
          {offered.map((entry) => (
            <li key={entry.key}>
              <button
                type="button"
                class="eb-button eb-plain"
                disabled={drawing.busy}
                onClick={() => entry.action && drawing.act(entry.action)}
              >
                {String(entry.fields.label)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
