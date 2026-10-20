/**
 * One screen of the stack (M4.1, D51): its regions of widgets, or, for a mode no screen shows, the
 * actions on offer as buttons. The top one takes focus and taps; those under it are inert. A screen
 * that comes back to the top gives focus back to the control it last had (M4.2).
 */
import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { Screen } from '../format/screen.ts';
import { usable } from '../input/focus.ts';
import { type Drawing, freshId } from './context.ts';
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
