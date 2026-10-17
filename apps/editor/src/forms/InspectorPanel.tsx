import { current } from '../projects/opened.ts';
import { RecordForm } from './RecordForm.tsx';
import { chosen } from './selection.ts';

/** The Inspector panel (M2.4): the form for the record chosen in the Project panel. */
export function InspectorPanel() {
  const project = current.value;
  const pick = chosen.value;
  return (
    <div class="panel" data-panel="inspector">
      <header class="panel-head">
        <h2>Inspector</h2>
      </header>
      {!project ? (
        <p class="muted">Open a project to edit its records here.</p>
      ) : !pick ? (
        <p class="muted">Choose a record in the Project panel to edit it here.</p>
      ) : (
        // Keyed by the record, so one record's typing never shows in the next one's fields.
        <RecordForm key={`${pick.type}/${pick.id}`} project={project} type={pick.type} id={pick.id} />
      )}
    </div>
  );
}
