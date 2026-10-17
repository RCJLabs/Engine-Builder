import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { slugify } from '../forms/labels.ts';

/**
 * Naming a new record or a copy (M2.4's New, M2.5's Duplicate): what is typed makes the id
 * ("Ludus Magnus" is ludus-magnus), and the form shows the file it will be. An id that is taken,
 * or that the words don't make, can't be used. The box takes focus as it opens.
 */
export function NameRecord(props: {
  type: string;
  ids: readonly string[];
  /** The box's label: "Name of the new gladiator", "Name of the copy". */
  label: string;
  /** The button that makes it: "Create", "Duplicate". */
  action: string;
  initial?: string;
  done: (id: string, typed: string) => void;
  cancel: () => void;
}) {
  const { type, ids, label, action, done, cancel } = props;
  const [typed, setTyped] = useState(props.initial ?? '');
  const box = useRef<HTMLInputElement>(null);
  const field = useUniqueId();
  useLayoutEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);
  const id = slugify(typed);
  const taken = ids.includes(id);
  const problem = typed.trim() === '' ? null : id === '' ? 'Use letters or digits' : taken ? `${id} is taken` : null;
  return (
    <form
      class="new-record"
      onSubmit={(event) => {
        event.preventDefault();
        if (id !== '' && !taken) done(id, typed);
      }}
    >
      <label for={field}>{label}</label>
      <input
        ref={box}
        id={field}
        class="field"
        value={typed}
        autoComplete="off"
        autocapitalize="none"
        spellcheck={false}
        aria-describedby={`${field}-said`}
        aria-invalid={problem ? 'true' : undefined}
        onInput={(event) => setTyped(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancel();
        }}
      />
      <p id={`${field}-said`} class={problem ? 'field-problem' : 'form-help'}>
        {problem ?? (id ? `Saved as records/${type}/${id}.json` : 'Lowercase words joined by hyphens make its id.')}
      </p>
      <div class="form-actions">
        <button type="submit" class="button primary" disabled={id === '' || taken}>
          {action}
        </button>
        <button type="button" class="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
