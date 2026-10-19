/**
 * Tabs as WAI-ARIA's tabs pattern has them: one tab stop, arrows move between tabs, and the panel
 * below shows the chosen tab's widgets. Tapping a tab chooses it; nothing waits on hover.
 */
import type { ComponentChildren } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { freshId } from './context.ts';

interface Props {
  readonly labels: readonly string[];
  readonly panel: (index: number) => ComponentChildren;
}

export function Tabs({ labels, panel }: Props) {
  const [chosen, setChosen] = useState(0);
  const id = useMemo(() => freshId('tabs'), []);
  const list = useRef<HTMLDivElement>(null);
  const at = Math.min(chosen, labels.length - 1);
  const move = (to: number) => {
    const next = (to + labels.length) % labels.length;
    setChosen(next);
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
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
    <div class="eb-tabs">
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
