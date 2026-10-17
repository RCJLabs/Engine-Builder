import { showPanel } from '../app/panelControl.ts';
import type { OpenProject } from '../projects/opened.ts';
import { tableType } from './viewState.ts';

/**
 * The open project's record types, in the Project panel, each with its count: a tap shows its
 * records in the Records panel's table (M2.5), where they are opened, made and changed.
 */
export function TypeList({ project }: { project: OpenProject }) {
  const { catalog } = project;
  return (
    <section class="records" aria-label="Record types">
      <h4>Records</h4>
      {catalog.names.length === 0 ? (
        <p class="muted">
          No record types yet. A type is a file in the project’s types/ folder; designing them here comes with M2.6.
        </p>
      ) : (
        <ul class="record-list">
          {catalog.names.map((type) => (
            <TypeEntry key={type} type={type} project={project} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TypeEntry({ type, project }: { type: string; project: OpenProject }) {
  const { catalog } = project;
  const data = catalog.types.get(type);
  const broken = catalog.broken.get(type);
  const count = catalog.records.get(type)?.length ?? 0;
  return (
    <li>
      <button
        type="button"
        class="record-button"
        onClick={() => {
          tableType.value = type;
          showPanel('records');
        }}
      >
        {data?.file.title ?? type} <span class="muted">{count === 1 ? '1 record' : `${count} records`}</span>
      </button>
      {broken ? (
        <p class="field-problem">
          {broken.file}: {broken.message}
        </p>
      ) : !data ? (
        <p class="muted">No types/{type}.json, so these records can’t be checked or edited here.</p>
      ) : null}
    </li>
  );
}
