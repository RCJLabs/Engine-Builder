/**
 * One of the shell's screens (M4.3): a heading the player hears as it opens, its controls, and a
 * bottom row. Drawn as a game's screens are (screens.css), so the game's theme is the shell's, and
 * focus and the pad move through it as they do through a game's (input/). Focus goes to the control
 * the screen last had, as a dialog's does, else to its heading.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { usable } from '../input/focus.ts';
import { freshId } from '../render/context.ts';

/** The control each screen last had, by its data-key, kept across the screen's comings and goings. */
export type ScreenMemory = Map<string, string>;

interface ShellScreenProps {
  readonly name: string;
  readonly title: string;
  readonly memory: ScreenMemory;
  readonly children: ComponentChildren;
  readonly bottom?: ComponentChildren;
  /** A modal sits over the game, as pause does. */
  readonly modal?: boolean;
}

export function ShellScreen({ name, title, memory, children, bottom, modal = false }: ShellScreenProps) {
  const section = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useMemo(() => freshId('shell'), []);
  useEffect(() => {
    const key = memory.get(name);
    const back = key === undefined ? null : section.current?.querySelector<HTMLElement>(`[data-key="${key}"]`);
    (back && usable(back) ? back : heading.current)?.focus({ preventScroll: true });
  }, [name]);
  const remember = (event: FocusEvent) => {
    const key = (event.target as HTMLElement).dataset.key;
    if (key !== undefined) memory.set(name, key);
  };
  return (
    <section
      ref={section}
      class={`eb-screen eb-shell-screen${modal ? ' eb-modal' : ''}`}
      aria-labelledby={id}
      {...(modal ? { role: 'dialog', 'aria-modal': 'true' } : {})}
      onFocusIn={remember}
    >
      <div class="eb-sheet">
        <div class="eb-region eb-main">
          <h2 class="eb-text eb-title eb-shell-heading" id={id} tabIndex={-1} ref={heading}>
            {title}
          </h2>
          {children}
        </div>
        {bottom ? <div class="eb-region eb-bottom eb-shell-row">{bottom}</div> : null}
      </div>
    </section>
  );
}
