import type { TargetedKeyboardEvent } from 'preact';
import { useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { type Command, matchCommands, stepActive } from '../app/commands.ts';

export interface Choice {
  /** What choosing it writes. */
  readonly value: string;
  readonly label: string;
  /** Other words that find it: a record's type, an asset's folder. */
  readonly keywords?: string;
}

/**
 * A modal list to choose from, with a field that narrows it: the command palette's pattern (M2.2),
 * the WAI-ARIA combobox. Focus stays in the field, the arrows move the choice and Enter takes it.
 * Escape, Cancel or a tap outside closes it without choosing.
 */
export function Picker(props: {
  title: string;
  choices: readonly Choice[];
  /** The value the field holds now, marked in the list. */
  current: string;
  /** What to say when there is nothing to choose from at all. */
  empty: string;
  choose: (value: string) => void;
  close: () => void;
}) {
  const { title, choices, current, empty, choose, close } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const base = useId();

  useLayoutEffect(() => {
    dialog.current?.showModal();
    field.current?.focus();
  }, []);

  const commands: Command[] = choices.map((choice, i) => ({
    id: String(i),
    title: choice.label,
    ...(choice.keywords ? { keywords: choice.keywords } : {}),
    run: () => choose(choice.value),
  }));
  const matches = matchCommands(commands, query);
  const chosen = matches[Math.min(Math.max(active, 0), matches.length - 1)];
  const take = (command: Command) => {
    // Closed first, as the palette does: the dialog hands focus back to the field's button.
    dialog.current?.close();
    command.run();
  };
  const onKeyDown = (event: TargetedKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(stepActive(matches.indexOf(chosen as Command), matches.length, event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && chosen) {
      event.preventDefault();
      take(chosen);
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the dialog's own Escape closes it from the keyboard; this click is a tap on the backdrop
    <dialog
      ref={dialog}
      class="palette picker"
      aria-labelledby={`${base}-title`}
      onClose={close}
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
    >
      <div class="picker-head">
        <h2 id={`${base}-title`}>{title}</h2>
        <button type="button" class="button" onClick={() => dialog.current?.close()}>
          Cancel
        </button>
      </div>
      <input
        ref={field}
        class="field palette-field"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={`${base}-options`}
        aria-activedescendant={chosen ? `${base}-${chosen.id}` : undefined}
        aria-autocomplete="list"
        aria-label="Search"
        placeholder="Search"
        autoComplete="off"
        autocapitalize="none"
        value={query}
        onInput={(event) => {
          setQuery(event.currentTarget.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      <div id={`${base}-options`} class="palette-options" role="listbox" aria-label={title}>
        {matches.map((command, index) => (
          // biome-ignore lint/a11y/useFocusableInteractive: combobox pattern: focus stays in the field, which points at the chosen option with aria-activedescendant
          // biome-ignore lint/a11y/useKeyWithClickEvents: the field drives the list from the keyboard; this click is for pointers and taps
          <div
            key={command.id}
            id={`${base}-${command.id}`}
            class="palette-option"
            role="option"
            aria-selected={command === chosen}
            onClick={() => take(command)}
            onPointerMove={() => setActive(index)}
          >
            {command.title}
            {choices[Number(command.id)]?.value === current ? <span class="muted"> (chosen now)</span> : null}
          </div>
        ))}
      </div>
      {choices.length === 0 ? <p class="muted palette-empty">{empty}</p> : null}
      {choices.length > 0 && matches.length === 0 ? (
        <p class="muted palette-empty">Nothing matches “{query}”.</p>
      ) : null}
    </dialog>
  );
}
