import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { note } from '../app/state.ts';
import { current } from '../projects/opened.ts';
import { chosen } from './selection.ts';

type FormModule = typeof import('./RecordForm.tsx');

/**
 * The record form loads when a record is first chosen, as the dock loads only on desktop (M2.2):
 * with the checks it runs it is 13 kB gzipped the editor's start needn't carry (Readings). The
 * offline cache holds it like any other file.
 */
const formModule = signal<FormModule | null>(null);
let loading = false;

function loadForm(): void {
  if (loading) return;
  loading = true;
  import('./RecordForm.tsx').then(
    (module) => {
      formModule.value = module;
    },
    (error: unknown) => {
      loading = false;
      note(`The record form couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}

/** The Inspector panel (M2.4): the form for the record chosen in the Project panel. */
export function InspectorPanel() {
  const project = current.value;
  const pick = chosen.value;
  useEffect(() => {
    if (pick) loadForm();
  }, [pick]);
  const RecordForm = formModule.value?.RecordForm;
  return (
    <div class="panel" data-panel="inspector">
      <header class="panel-head">
        <h2>Inspector</h2>
      </header>
      {!project ? (
        <p class="muted">Open a project to edit its records here.</p>
      ) : !pick ? (
        <p class="muted">Choose a record in the Project panel to edit it here.</p>
      ) : !RecordForm ? (
        <p class="muted">Opening {pick.id}…</p>
      ) : (
        // Keyed by the record, so one record's typing never shows in the next one's fields.
        <RecordForm key={`${pick.type}/${pick.id}`} project={project} type={pick.type} id={pick.id} />
      )}
    </div>
  );
}
