import type { DataType } from '@eb/schema';
import { useMemo, useRef, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import type { Catalog } from '../forms/catalog.ts';
import { chosen } from '../forms/selection.ts';
import type { OpenProject } from '../projects/opened.ts';
import { createRecord, deleteRecords, duplicateRecord, openRecord, setField } from './actions.ts';
import { BulkEdit } from './BulkEdit.tsx';
import type { NameOf } from './cells.ts';
import { Filters, newFilter } from './Filters.tsx';
import { NameRecord } from './NameRecord.tsx';
import { copyName, namesOf } from './names.ts';
import { type Picked, RecordsTable } from './RecordsTable.tsx';
import { SelectionBar } from './SelectionBar.tsx';
import { type Column, columnsOf, type Row, rowsOf } from './table.ts';
import { type View, viewRows } from './view.ts';
import { setView, viewOf } from './viewState.ts';
import '../styles/tables.css';

/** Rows drawn at a time: enough to scroll through, few enough to draw at once on a phone. */
export const PAGE = 100;

type Doing = { readonly kind: 'new' } | { readonly kind: 'duplicate'; readonly id: string } | { readonly kind: 'bulk' };

const records = (count: number) => (count === 1 ? '1 record' : `${count} records`);

/**
 * One type's records (M2.5): a search, filters and a sort over its table, which shows PAGE rows at
 * a time, and, in the tab that edits, a selection to change, copy or delete, and New.
 */
export function TypeTable({ project, type }: { project: OpenProject; type: string }) {
  const { catalog, index } = project;
  const data = catalog.types.get(type);
  const title = data?.file.title ?? type;
  const canEdit = editing.access.value.kind === 'editing';
  const view = viewOf(type);
  const ids = catalog.records.get(type) ?? [];
  const nameOf = useMemo(() => namesOf(index, catalog), [index, catalog]);
  const columns = useMemo(() => columnsOf(data?.file), [data]);
  const rows = useMemo(() => (index ? rowsOf(index, catalog, type, nameOf) : null), [index, catalog, type, nameOf]);
  const shown = useMemo(() => (rows ? viewRows(rows, columns, view) : []), [rows, columns, view]);
  const [limit, setLimit] = useState(PAGE);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [doing, setDoing] = useState<Doing | null>(null);
  const region = useRef<HTMLElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const searchId = useUniqueId();
  const captionId = useUniqueId();
  // What is selected is what the view shows of it: a record deleted or filtered out drops away.
  const selected = shown.filter((row) => picked.has(row.record.id));
  const change = (next: (view: View) => View, keepSelection = false) => {
    setView(type, next);
    setLimit(PAGE);
    if (!keepSelection) setPicked(new Set());
  };
  const sortBy = (column: Column) =>
    change(
      (now) => ({
        ...now,
        sort:
          now.sort.column === column.key
            ? { column: column.key, descending: !now.sort.descending }
            : // Most first for counts, as people look for the records with the most problems or users.
              { column: column.key, descending: column.kind === 'problems' || column.kind === 'used-by' },
      }),
      true,
    );
  const done = (focus?: HTMLElement | null) => {
    setDoing(null);
    focus?.focus();
  };
  if (rows === null) return <p class="muted">Reading {records(ids.length)}…</p>;
  return (
    <>
      <div class="table-tools">
        <label for={searchId} class="visually-hidden">
          Search {title} records
        </label>
        <input
          id={searchId}
          class="field table-search"
          type="search"
          placeholder="Search"
          autoComplete="off"
          autocapitalize="none"
          spellcheck={false}
          value={view.search}
          onInput={(event) => {
            const search = event.currentTarget.value;
            change((now) => ({ ...now, search }));
          }}
        />
        <button
          ref={addButton}
          type="button"
          class="button"
          onClick={() => change((now) => ({ ...now, filters: [...now.filters, newFilter(columns)] }))}
        >
          Add a filter
        </button>
        {canEdit && data ? (
          <button type="button" class="button" onClick={() => setDoing({ kind: 'new' })}>
            New {title.toLowerCase()}
          </button>
        ) : null}
      </div>
      <Filters
        columns={columns}
        filters={view.filters}
        catalog={catalog}
        nameOf={nameOf}
        change={(filters) => {
          const fewer = filters.length < view.filters.length;
          change((now) => ({ ...now, filters }));
          // The row whose ✕ was tapped is gone: focus goes back to where filters come from.
          if (fewer) addButton.current?.focus();
        }}
      />
      {!data ? (
        <p class="muted">
          {catalog.broken.get(type)
            ? `Its type file has a problem, so these records can’t be checked or edited here: ${catalog.broken.get(type)?.file}: ${catalog.broken.get(type)?.message}`
            : `There is no types/${type}.json, so these records can’t be checked or edited here.`}
        </p>
      ) : null}
      <p class="muted table-count" role="status">
        {shown.length === rows.length ? records(rows.length) : `${shown.length} of ${records(rows.length)}`}
      </p>
      {doing?.kind === 'new' && data ? (
        <NameRecord
          type={type}
          ids={ids}
          label={`Name of the new ${title.toLowerCase()}`}
          action="Create"
          done={(id, typed) => {
            createRecord(data, id, typed);
            setDoing(null);
          }}
          cancel={() => done(addButton.current)}
        />
      ) : null}
      {canEdit && data && selected.length > 0 ? (
        <Selection
          {...{ data, catalog, selected, doing, setDoing, done, editButton, ids, nameOf }}
          usedElsewhere={usedElsewhere(project, selected)}
          clear={() => {
            setPicked(new Set());
            region.current?.focus();
          }}
          unselect={() => setPicked(new Set())}
        />
      ) : null}
      <RecordsTable
        caption={`${title} records`}
        captionId={captionId}
        columns={columns}
        rows={shown.slice(0, limit)}
        sort={view.sort}
        sortBy={sortBy}
        open={(id) => openRecord(type, id)}
        current={chosen.value?.type === type ? `${type}:${chosen.value.id}` : null}
        region={region}
        pick={
          canEdit && data
            ? {
                picked,
                all: pickedState(shown, picked),
                count: shown.length,
                toggle: (id) => setPicked(toggled(picked, id)),
                toggleAll: () =>
                  setPicked(
                    pickedState(shown, picked) === 'all' ? new Set() : new Set(shown.map((row) => row.record.id)),
                  ),
              }
            : null
        }
      />
      {shown.length > limit ? (
        <div class="form-actions">
          <button
            type="button"
            class="button"
            onClick={() => {
              setLimit(limit + PAGE);
              // The button stays for more, and keeps focus; the last of them takes it away, so focus
              // goes to the first row it showed.
              if (shown.length <= limit + PAGE) {
                requestAnimationFrame(() =>
                  region.current?.querySelectorAll<HTMLElement>('.record-link')[limit]?.focus(),
                );
              }
            }}
          >
            Show {Math.min(PAGE, shown.length - limit)} more of {shown.length - limit}
          </button>
        </div>
      ) : null}
    </>
  );
}

/** The selection bar, and what it opens: a bulk edit, or naming a copy. */
function Selection(props: {
  data: DataType;
  catalog: Catalog;
  nameOf: NameOf;
  selected: readonly Row[];
  ids: readonly string[];
  doing: Doing | null;
  setDoing: (doing: Doing | null) => void;
  done: (focus?: HTMLElement | null) => void;
  editButton: { current: HTMLButtonElement | null };
  usedElsewhere: number;
  /** Clears the selection and moves focus to the table. */
  clear: () => void;
  /** Clears the selection, leaving focus where it goes. */
  unselect: () => void;
}) {
  const { data, catalog, nameOf, selected, ids, doing, setDoing, done, editButton, usedElsewhere, clear, unselect } =
    props;
  const only = selected.length === 1 ? selected[0] : undefined;
  // Records that aren't JSON can't take a field; they stay out of a bulk edit, and it says so.
  const editable = selected.filter((row) => row.record.unreadable === undefined).map((row) => row.record);
  return (
    <>
      <SelectionBar
        ids={selected.map((row) => row.record.id)}
        usedElsewhere={usedElsewhere}
        editButton={editButton}
        editField={() => setDoing({ kind: 'bulk' })}
        duplicate={only ? () => setDoing({ kind: 'duplicate', id: only.record.id }) : null}
        remove={() => {
          deleteRecords(
            data.type,
            selected.map((row) => row.record.id),
          );
          clear();
        }}
        clear={clear}
      />
      {doing?.kind === 'bulk' ? (
        <>
          {editable.length < selected.length ? (
            <p class="form-help">
              {records(selected.length - editable.length)} can’t be read, so{' '}
              {selected.length - editable.length === 1 ? 'it is' : 'they are'} left as they are.
            </p>
          ) : null}
          <BulkEdit
            data={data}
            catalog={catalog}
            names={nameOf}
            selected={editable}
            apply={(field, label, value) => {
              setField(
                data,
                editable.map((record) => record.id),
                field,
                label,
                value,
              );
              done(editButton.current);
            }}
            close={() => done(editButton.current)}
          />
        </>
      ) : null}
      {doing?.kind === 'duplicate' && only ? (
        <NameRecord
          type={data.type}
          ids={ids}
          label={`Name of the copy of ${only.record.id}`}
          action="Duplicate"
          initial={copyName(only.name ?? only.record.id, ids)}
          done={(id, typed) => {
            duplicateRecord(data, only.record.id, id, typed);
            setDoing(null);
            // Done with what was selected: the copy opens in the inspector.
            unselect();
          }}
          cancel={() => done(editButton.current)}
        />
      ) : null}
    </>
  );
}

function toggled(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function pickedState(shown: readonly Row[], picked: ReadonlySet<string>): Picked {
  const count = shown.filter((row) => picked.has(row.record.id)).length;
  return count === 0 ? 'none' : count === shown.length ? 'all' : 'some';
}

/** How many records outside the selection refer to a record in it. */
function usedElsewhere(project: OpenProject, selected: readonly Row[]): number {
  const keys = new Set(selected.map((row) => row.record.key));
  const users = new Set<string>();
  for (const key of keys) {
    for (const usage of project.index?.usedBy.get(key) ?? []) if (!keys.has(usage.from)) users.add(usage.from);
  }
  return users.size;
}
