import { signal } from '@preact/signals';
import type { TargetedKeyboardEvent } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { appCommands } from './appCommands.ts';
import { type Command, matchCommands, stepActive } from './commands.ts';

export const paletteOpen = signal(false);

/**
 * The command palette: a modal dialog with one field, whose list follows what is typed. It is
 * the WAI-ARIA combobox pattern: focus stays in the field, the arrows move the choice, Enter runs
 * it, and Escape (the dialog's own) closes. A tap on a command runs it too.
 */
export function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const open = paletteOpen.value;

  // A layout effect, so the field has focus before the next key press is handled.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      setQuery('');
      setActive(0);
      element.showModal();
      field.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  const matches = open ? matchCommands(appCommands(), query) : [];
  const chosen = matches[Math.min(Math.max(active, 0), matches.length - 1)];
  const run = (command: Command) => {
    // Closed first: the dialog hands focus back as it closes, which must not undo focus the
    // command moves, and while it is open the page outside it (the zip picker's input) is inert.
    dialog.current?.close();
    paletteOpen.value = false;
    command.run();
  };
  const onKeyDown = (event: TargetedKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(stepActive(matches.indexOf(chosen as Command), matches.length, event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && chosen) {
      event.preventDefault();
      run(chosen);
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the dialog's own Escape closes it from the keyboard; this click is a tap on the backdrop
    <dialog
      ref={dialog}
      class="palette"
      aria-label="Commands"
      // Escape's cancel comes as it shuts, but its close a task later: Ctrl+K pressed in between
      // must open it again, so the state follows the cancel, and a close that comes after the
      // palette opened again is an old one.
      onCancel={() => {
        paletteOpen.value = false;
      }}
      onClose={() => {
        if (!dialog.current?.open) paletteOpen.value = false;
      }}
      // A tap on the backdrop lands on the dialog itself, outside its content: it closes.
      onClick={(event) => {
        if (event.target === dialog.current) paletteOpen.value = false;
      }}
    >
      <input
        ref={field}
        class="field palette-field"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-options"
        aria-activedescendant={chosen ? `palette-${chosen.id}` : undefined}
        aria-autocomplete="list"
        aria-label="Command"
        placeholder="Type a command"
        autoComplete="off"
        value={query}
        onInput={(event) => {
          setQuery(event.currentTarget.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      <div id="palette-options" class="palette-options" role="listbox" aria-label="Commands">
        {matches.map((command, index) => (
          // biome-ignore lint/a11y/useFocusableInteractive: combobox pattern: focus stays in the field, which points at the chosen option with aria-activedescendant
          // biome-ignore lint/a11y/useKeyWithClickEvents: the field drives the list from the keyboard; this click is for pointers and taps
          <div
            key={command.id}
            id={`palette-${command.id}`}
            class="palette-option"
            role="option"
            aria-selected={command === chosen}
            onClick={() => run(command)}
            onPointerMove={() => setActive(index)}
          >
            {command.title}
          </div>
        ))}
      </div>
      {matches.length === 0 ? <p class="muted palette-empty">No command matches “{query}”.</p> : null}
    </dialog>
  );
}
