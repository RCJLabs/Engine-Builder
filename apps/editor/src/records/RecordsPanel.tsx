import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { note } from '../app/state.ts';
import { editing } from '../editing/current.ts';
import { current } from '../projects/opened.ts';
import { designType, startNewType } from '../types/open.ts';
import { tableType } from './viewState.ts';

type TableModule = typeof import('./TypeTable.tsx');

/**
 * The table and its tools load once a project is open, as the record form does (M2.4): with the
 * fields its bulk edits reuse, they are more than the editor's start should carry.
 */
const tableModule = signal<TableModule | null>(null);
let loading = false;

function loadTable(): void {
  if (loading) return;
  loading = true;
  import('./TypeTable.tsx').then(
    (module) => {
      tableModule.value = module;
    },
    (error: unknown) => {
      loading = false;
      note(`The records table couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}

/** The Records panel (M2.5): one type's records at a time, as a table. */
export function RecordsPanel() {
  const project = current.value;
  const choose = useUniqueId();
  useEffect(() => {
    if (project) loadTable();
  }, [project]);
  const names = project?.catalog.names ?? [];
  const type = tableType.value !== null && names.includes(tableType.value) ? tableType.value : names[0];
  const TypeTable = tableModule.value?.TypeTable;
  const canEdit = editing.access.value.kind === 'editing';
  return (
    <div class="panel" data-panel="records">
      <header class="panel-head">
        <h2>Records</h2>
      </header>
      {!project ? (
        <p class="muted">Open a project to see its records here.</p>
      ) : type === undefined ? (
        <>
          <p class="muted">No record types yet. A type is a kind of record, like players, gladiators or cards.</p>
          {canEdit ? (
            <button type="button" class="button primary" onClick={startNewType}>
              New type
            </button>
          ) : null}
        </>
      ) : (
        <>
          <div class="table-type">
            <label for={choose}>Type</label>
            <select
              id={choose}
              class="field"
              value={type}
              onChange={(event) => {
                tableType.value = event.currentTarget.value;
              }}
            >
              {names.map((name) => (
                <option key={name} value={name}>
                  {`${project.catalog.types.get(name)?.file.title ?? name} (${project.catalog.records.get(name)?.length ?? 0})`}
                </option>
              ))}
            </select>
            <button type="button" class="button" onClick={() => designType(type)}>
              Edit type
            </button>
            {canEdit ? (
              <button type="button" class="button" onClick={startNewType}>
                New type
              </button>
            ) : null}
          </div>
          {TypeTable ? (
            // Keyed by the type, so one type's selection and paging never carry into another's.
            <TypeTable key={type} project={project} type={type} />
          ) : (
            <p class="muted">Opening the table…</p>
          )}
        </>
      )}
    </div>
  );
}
