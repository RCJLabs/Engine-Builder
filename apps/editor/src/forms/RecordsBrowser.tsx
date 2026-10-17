import type { DataType } from '@eb/schema';
import { useId, useState } from 'preact/hooks';
import { showPanel } from '../app/panelControl.ts';
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import { type Catalog, recordFile } from './catalog.ts';
import { slugify } from './labels.ts';
import { createRecordFile } from './recordEdits.ts';
import { chosen } from './selection.ts';
import { newRecord } from './values.ts';

const openRecord = (type: string, id: string) => {
  chosen.value = { type, id };
  showPanel('inspector');
};

/**
 * The open project's records by type, in the Project panel: a tap opens one in the inspector,
 * the sheet on a phone. M2.5 turns these lists into tables.
 */
export function RecordsBrowser({ project }: { project: OpenProject }) {
  const { catalog } = project;
  return (
    <section class="records" aria-label="Records">
      <h4>Records</h4>
      {catalog.names.length === 0 ? (
        <p class="muted">
          No record types yet. A type is a file in the project’s types/ folder; designing them here comes with M2.6.
        </p>
      ) : (
        catalog.names.map((type) => <TypeRecords key={type} type={type} catalog={catalog} />)
      )}
    </section>
  );
}

function TypeRecords({ type, catalog }: { type: string; catalog: Catalog }) {
  const data = catalog.types.get(type);
  const broken = catalog.broken.get(type);
  const ids = catalog.records.get(type) ?? [];
  const pick = chosen.value;
  return (
    <div class="type-records">
      <h5>
        {data?.file.title ?? type} <span class="muted">{ids.length}</span>
      </h5>
      {broken ? (
        <p class="field-problem">
          {broken.file}: {broken.message}
        </p>
      ) : !data ? (
        <p class="muted">No types/{type}.json, so these records can’t be checked or edited here.</p>
      ) : null}
      {ids.length > 0 ? (
        <ul class="record-list">
          {ids.map((id) => (
            <li key={id}>
              <button
                type="button"
                class="record-button mono"
                aria-current={pick?.type === type && pick.id === id ? 'true' : undefined}
                onClick={() => openRecord(type, id)}
              >
                {id}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {data && editing.access.value.kind === 'editing' ? <NewRecord data={data} ids={ids} /> : null}
    </div>
  );
}

/**
 * A new record: typed as words, saved under the id they make ("Ludus Magnus" is ludus-magnus),
 * with the type's required fields empty, and opened in the inspector. A step undo takes back.
 */
function NewRecord({ data, ids }: { data: DataType; ids: readonly string[] }) {
  const [typed, setTyped] = useState<string | null>(null);
  const field = useId();
  const title = data.file.title;
  if (typed === null) {
    return (
      <button type="button" class="button" onClick={() => setTyped('')}>
        New {title.toLowerCase()}
      </button>
    );
  }
  const id = slugify(typed);
  const taken = ids.includes(id);
  const problem = typed.trim() === '' ? null : id === '' ? 'Use letters or digits' : taken ? `${id} is taken` : null;
  const create = () => {
    if (id === '' || taken) return;
    const file = recordFile(data.type, id);
    void editing.edit(`New ${title.toLowerCase()} ${id}`, (copy) => createRecordFile(copy, file, newRecord(data.file)));
    setTyped(null);
    openRecord(data.type, id);
  };
  return (
    <form
      class="new-record"
      onSubmit={(event) => {
        event.preventDefault();
        create();
      }}
    >
      <label for={field}>Name of the new {title.toLowerCase()}</label>
      <input
        id={field}
        class="field"
        value={typed}
        autoComplete="off"
        autocapitalize="none"
        spellcheck={false}
        aria-describedby={`${field}-said`}
        aria-invalid={problem ? 'true' : undefined}
        onInput={(event) => setTyped(event.currentTarget.value)}
      />
      <p id={`${field}-said`} class={problem ? 'field-problem' : 'form-help'}>
        {problem ??
          (id ? `Saved as records/${data.type}/${id}.json` : 'Lowercase words joined by hyphens make its id.')}
      </p>
      <div class="form-actions">
        <button type="submit" class="button primary" disabled={id === '' || taken}>
          Create
        </button>
        <button type="button" class="button" onClick={() => setTyped(null)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
