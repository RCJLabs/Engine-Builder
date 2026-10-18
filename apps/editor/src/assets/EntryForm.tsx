import type { Provenance } from '@eb/schema';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import type { Catalog } from '../forms/catalog.ts';
import { FormContext } from '../forms/formContext.ts';
import { entryProblems, localForm, ProvenanceFields } from './ProvenanceFields.tsx';

/**
 * A provenance entry written before it goes into the log (D34): for files being imported, files
 * already there without one, or a replacement. The check is the compiler's, over every file it
 * will cover, so what the form lets through builds. Until Go is tried, a box shows its problems
 * only once something is in it.
 */
export function EntryForm(props: {
  catalog: Catalog;
  heading: string;
  /** The files the entry will cover, inside assets/, for the licence check. */
  paths: readonly string[];
  initial: Record<string, unknown>;
  goLabel: string;
  /** Why it can't go, beside the entry's own problems: too much at once, no file. */
  blocked?: string | null;
  go: (entry: Provenance) => Promise<boolean>;
  /** Absent where the form stays until it has gone, as for an asset with no entry. */
  cancel?: () => void;
  children?: ComponentChildren;
}) {
  const { catalog, heading, paths, initial, goLabel, blocked, go, cancel, children } = props;
  const head = useUniqueId();
  const [entry, setEntry] = useState<Record<string, unknown>>(initial);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const problems = entryProblems(entry, paths, tried);
  const submit = async () => {
    setTried(true);
    if (blocked || entryProblems(entry, paths, true).length > 0) return;
    setBusy(true);
    // The form closes when it has gone; when it is refused it stays, with what it said.
    if (!(await go(entry as unknown as Provenance))) setBusy(false);
  };
  return (
    <section class="entry-form" aria-labelledby={head}>
      <h3 id={head}>{heading}</h3>
      {children}
      <FormContext.Provider value={localForm(catalog, entry, setEntry, problems)}>
        <ProvenanceFields entry={entry} withEdits={false} />
      </FormContext.Provider>
      {tried && (blocked || problems.length > 0) ? (
        <p class="field-problem" role="alert">
          {blocked ?? 'Fill in what the boxes above ask for first.'}
        </p>
      ) : null}
      <div class="form-actions">
        <button type="button" class="button primary" disabled={busy} onClick={() => void submit()}>
          {goLabel}
        </button>
        {cancel ? (
          <button type="button" class="button" onClick={cancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </section>
  );
}
