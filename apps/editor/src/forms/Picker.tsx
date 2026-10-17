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
  const base = useId();
  const { query, type, matches, chosen, take, setActive, onKeyDown } = useCombo(choices, choose, () =>
    dialog.current?.close(),
  );

  useLayoutEffect(() => {
    dialog.current?.showModal();
    field.current?.focus();
  }, []);

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
        onInput={(event) => type(event.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      <PickerList
        {...{ base, title, matches, chosen, take, setActive }}
        current={choices.findIndex((choice) => choice.value === current)}
      />
      {choices.length === 0 ? <p class="muted palette-empty">{empty}</p> : null}
      {choices.length > 0 && matches.length === 0 ? (
        <p class="muted palette-empty">Nothing matches “{query}”.</p>
      ) : null}
    </dialog>
  );
}

/** The listbox: the choices that match, the one the arrows are on, and the one the field holds now. */
function PickerList(props: {
  base: string;
  title: string;
  matches: readonly Command[];
  chosen: Command | undefined;
  /** The index of the choice the field holds, or -1. */
  current: number;
  take: (command: Command) => void;
  setActive: (index: number) => void;
}) {
  const { base, title, matches, chosen, current, take, setActive } = props;
  return (
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
          {Number(command.id) === current ? <span class="muted"> (chosen now)</span> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * The combobox's state: what is typed, the choices that match, the one the arrows are on, and
 * taking one. `shut` closes the dialog first, as the palette does, so it hands focus back to the
 * field's button before the choice is written.
 */
function useCombo(choices: readonly Choice[], choose: (value: string) => void, shut: () => void) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const commands: Command[] = choices.map((choice, i) => ({
    id: String(i),
    title: choice.label,
    ...(choice.keywords ? { keywords: choice.keywords } : {}),
    run: () => choose(choice.value),
  }));
  const matches = matchCommands(commands, query);
  const chosen = matches[Math.min(Math.max(active, 0), matches.length - 1)];
  const take = (command: Command) => {
    shut();
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
  const type = (text: string) => {
    setQuery(text);
    setActive(0);
  };
  return { query, type, matches, chosen, take, setActive, onKeyDown };
}
