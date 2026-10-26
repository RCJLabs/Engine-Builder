/**
 * One screen of the stack (M4.1, D51): its regions of widgets, or, for a mode no screen shows, the
 * actions on offer as buttons. The top one takes focus and taps; those under it are inert. A screen
 * that comes back to the top gives focus back to the control it last had (M4.2).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Screen } from '../format/screen.ts';
import { usable } from '../input/focus.ts';
import { type Drawing, drawingUnder, freshId } from './context.ts';
import type { Shown } from './stack.ts';
import { WidgetView } from './Widget.tsx';

interface ScreenProps {
  readonly shown: Shown;
  readonly top: boolean;
  readonly drawing: Drawing;
  readonly remembered: (screen: HTMLElement) => HTMLElement | undefined;
}

export function ScreenView({ shown, top, drawing, remembered }: ScreenProps) {
  const section = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useMemo(() => freshId('screen'), []);
  const modal = shown.kind === 'screen' && shown.screen.modal === true;
  const wasTop = useRef(false);
  const covered = useMemo(() => drawingUnder(drawing, top), [top, drawing]);
  // A screen that comes to the top while the player is in the game takes focus, and so does a step
  // that left focus nowhere, as a button that went does: back to the control it last had, as a
  // dialog gives focus back to what opened it, or else to its heading, which announces it. The
  // shell's pause going leaves focus nowhere too (M4.3).
  useEffect(() => {
    const element = heading.current;
    const became = top && !wasTop.current;
    wasTop.current = top;
    if (!top || !element || drawing.paused) return;
    const active = document.activeElement;
    const lost = active === null || active === document.body;
    if (!lost && !(became && element.closest('.eb-game')?.contains(active))) return;
    const back = section.current ? remembered(section.current) : undefined;
    const target = back && section.current?.contains(back) && usable(back) ? back : element;
    target.focus({ preventScroll: true });
  }, [top, drawing.view, drawing.paused]);
  const title = shown.kind === 'screen' ? (shown.screen.title ?? shown.id) : shown.mode;
  return (
    <section
      ref={section}
      class={`eb-screen${modal ? ' eb-modal' : ''}`}
      inert={top ? undefined : true}
      {...(modal && top ? { role: 'dialog', 'aria-modal': 'true' } : {})}
      aria-labelledby={id}
    >
      <div class="eb-sheet">
        <h2 class="eb-sr" id={id} tabIndex={-1} ref={heading}>
          {title}
        </h2>
        {shown.kind === 'screen' ? <Regions screen={shown.screen} drawing={covered} /> : <Fallback drawing={drawing} />}
      </div>
    </section>
  );
}

/**
 * Whether the main region scrolls, checked after each draw and as it or its content changes size.
 * One that scrolls takes a tab stop, so a keyboard can reach it and scroll it, as axe asks
 * (scrollable-region-focusable); spatial focus walks only controls, so arrows and a pad are as before.
 */
function useScrolls() {
  const main = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useLayoutEffect(() => {
    const element = main.current;
    if (!element) return;
    const check = () => setScrolls(element.scrollHeight > element.clientHeight + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  });
  return { main, scrolls };
}

function Regions({ screen, drawing }: { readonly screen: Screen; readonly drawing: Drawing }) {
  // Designed (M4.5), each region's widget says where it sits.
  const at = (region: string) => (drawing.design ? `/${region}` : undefined);
  const { main, scrolls } = useScrolls();
  return (
    <>
      {screen.top && (
        <div class="eb-region eb-top">
          <WidgetView widget={screen.top} drawing={drawing} at={at('top')} />
        </div>
      )}
      {/* A screen being designed may have no main yet: the checks say so (E047). */}
      <div class="eb-region eb-main" ref={main} tabIndex={scrolls && !drawing.design ? 0 : undefined}>
        {screen.main && <WidgetView widget={screen.main} drawing={drawing} at={at('main')} />}
      </div>
      {screen.bottom && (
        <div class="eb-region eb-bottom">
          <WidgetView widget={screen.bottom} drawing={drawing} at={at('bottom')} />
        </div>
      )}
    </>
  );
}

/**
 * A mode no screen shows: every action on offer as a button, so the game can still be played. With
 * none and the game not over, a mode the shell draws over it (fallen, M6.4): nothing to say here.
 */
function Fallback({ drawing }: { readonly drawing: Drawing }) {
  const offered = drawing.view.lists.offered ?? [];
  return (
    <div class="eb-region eb-main">
      {offered.length === 0 ? (
        drawing.view.ended ? (
          <p class="eb-text eb-empty">Nothing to do: the game is over.</p>
        ) : null
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
