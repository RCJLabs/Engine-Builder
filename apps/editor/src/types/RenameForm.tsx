import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';

/**
 * A new name for a field, a type, a choice or a record (M2.6): the box starts at the name as it
 * is, and takes focus as it opens. `check` says why a name can't be used; `said` what the name
 * will do. Renaming to the same name just closes it.
 */
export function RenameForm(props: {
  /** The box's label: "New name for might". */
  label: string;
  initial: string;
  check: (typed: string) => string | null;
  said: (typed: string) => string;
  /** Turns what is typed into the name, as an id is made from words; as typed when absent. */
  shape?: (typed: string) => string;
  done: (name: string) => void;
  cancel: () => void;
}) {
  const { label, initial, check, said, shape = (typed: string) => typed.trim(), done, cancel } = props;
  const [typed, setTyped] = useState(initial);
  const box = useRef<HTMLInputElement>(null);
  const id = useUniqueId();
  useLayoutEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);
  const name = shape(typed);
  const problem = name === initial ? null : check(name);
  return (
    <form
      class="rename-form"
      aria-label={`Rename ${initial}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (name === initial) cancel();
        else if (!problem) done(name);
      }}
    >
      <label for={id}>{label}</label>
      <input
        ref={box}
        id={id}
        class="field"
        value={typed}
        autoComplete="off"
        autocapitalize="none"
        spellcheck={false}
        aria-describedby={`${id}-said`}
        aria-invalid={problem ? 'true' : undefined}
        onInput={(event) => setTyped(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancel();
        }}
      />
      <p id={`${id}-said`} class={problem ? 'field-problem' : 'form-help'}>
        {problem ?? said(name)}
      </p>
      <div class="form-actions">
        <button type="submit" class="button primary" disabled={problem !== null}>
          Rename
        </button>
        <button type="button" class="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
