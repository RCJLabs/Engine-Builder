/**
 * Tabs as WAI-ARIA's tabs pattern has them: one tab stop, arrows move between tabs, and the panel
 * below shows the chosen tab's widgets. Tapping a tab chooses it; nothing waits on hover. A pad's
 * LB and RB and a swipe step the tab too (M4.2), by an event the tab list hears (focus.ts).
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { TAB_STEP } from '../input/focus.ts';
import { freshId } from './context.ts';

interface Props {
  readonly labels: readonly string[];
  readonly panel: (index: number) => ComponentChildren;
  /** The tab shown whatever was chosen: in a frame being designed, the one the selection is in (M4.5). */
  readonly shown?: number | undefined;
}

export function Tabs({ labels, panel, shown }: Props) {
  const [chosen, setChosen] = useState(0);
  const id = useMemo(() => freshId('tabs'), []);
  const list = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const at = Math.max(0, Math.min(shown ?? chosen, labels.length - 1));
  const move = (to: number) => {
    const next = (to + labels.length) % labels.length;
    setChosen(next);
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  const stepBy = (step: number) => move(at + step);
  const stepped = useRef(stepBy);
  stepped.current = stepBy;
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const hear = (event: Event) => stepped.current((event as CustomEvent<1 | -1>).detail);
    element.addEventListener(TAB_STEP, hear);
    return () => element.removeEventListener(TAB_STEP, hear);
  }, []);
  const onKey = (event: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      move(at + step);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      move(event.key === 'Home' ? 0 : labels.length - 1);
    }
  };
  return (
    <div class="eb-tabs" ref={root}>
      <div class="eb-tablist" role="tablist" ref={list} onKeyDown={onKey}>
        {labels.map((label, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            class="eb-tab"
            aria-selected={i === at}
            aria-controls={`${id}-panel`}
            tabIndex={i === at ? 0 : -1}
            onClick={() => setChosen(i)}
          >
            {label}
          </button>
        ))}
      </div>
      <div class="eb-tabpanel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${at}`}>
        {panel(at)}
      </div>
    </div>
  );
}
