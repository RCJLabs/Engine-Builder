import { pointerSegment } from '@eb/core';
import type { DataType, Diagnostic } from '@eb/schema';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { type OpenProject, revision } from '../projects/opened.ts';
import { recordFile } from './catalog.ts';
import { FieldView } from './FieldView.tsx';
import { type FormApi, FormContext, pointerOf } from './formContext.ts';
import { labelOf } from './labels.ts';
import { checkRecord, fieldPointers, routeProblems } from './problems.ts';
import { changeRecord, deleteRecordFile, type LoadedRecord, loadRecord } from './recordEdits.ts';
import { getIn, setIn } from './values.ts';

/** The record's file as it is now: read again after every change, and when this tab starts or stops editing. */
function useLoaded(project: OpenProject, file: string): LoadedRecord | null {
  const [loaded, setLoaded] = useState<LoadedRecord | null>(null);
  const changes = revision.value;
  const access = editing.access.value.kind;
  useEffect(() => {
    let live = true;
    void loadRecord(project.source, file).then((read) => {
      if (live) setLoaded(read);
    });
    return () => {
      live = false;
    };
  }, [project.source, file, changes, access]);
  return loaded;
}

/** The inspector's form for one record, or what stands in the way of one. */
export function RecordForm({ project, type, id }: { project: OpenProject; type: string; id: string }) {
  const file = recordFile(type, id);
  const loaded = useLoaded(project, file);
  const data = project.catalog.types.get(type);
  const broken = project.catalog.broken.get(type);
  if (!data) {
    return (
      <Notice title={type} id={id} file={file}>
        {broken
          ? `Its type file has a problem, so it can’t be edited here until that is fixed: ${broken.file}: ${broken.message}`
          : `There is no types/${type}.json, so this record can’t be checked or edited here.`}
      </Notice>
    );
  }
  if (loaded === null) return null;
  if (loaded.kind === 'missing') {
    return (
      <Notice title={data.file.title} id={id}>
        This record isn’t there any more: it was undone or deleted.
      </Notice>
    );
  }
  if (loaded.kind === 'unreadable') {
    return (
      <Notice title={data.file.title} id={id} file={file}>
        {`${file} can’t be read, so it can’t be edited here: ${loaded.message}`}
      </Notice>
    );
  }
  return <Form project={project} data={data} id={id} value={loaded.value} />;
}

function Notice(props: { title: string; id: string; file?: string; children: string }) {
  return (
    <section class="record-form" aria-label={`${props.title} ${props.id}`}>
      <RecordHead title={`${props.title}: ${props.id}`} id={props.id} file={props.file} />
      <p class="muted">{props.children}</p>
    </section>
  );
}

/** The record's name, and Delete: a step like any edit, which undo brings back. */
function RecordHead({ title, id, file }: { title: string; id: string; file?: string | undefined }) {
  const canEdit = editing.access.value.kind === 'editing';
  return (
    <header class="record-head">
      <h3>{title}</h3>
      {file ? (
        <button
          type="button"
          class="button danger"
          disabled={!canEdit}
          onClick={() => void editing.edit(`Delete ${id}`, (copy) => deleteRecordFile(copy, file))}
        >
          Delete
        </button>
      ) : null}
    </header>
  );
}

function Form({ project, data, id, value }: { project: OpenProject; data: DataType; id: string; value: unknown }) {
  const { catalog } = project;
  const { file: typeFile, type } = data;
  const file = recordFile(type, id);
  const canEdit = editing.access.value.kind === 'editing';
  const diagnostics = useMemo(() => checkRecord(catalog, type, id, value), [catalog, type, id, value]);
  const routed = useMemo(
    () => routeProblems(diagnostics, fieldPointers(typeFile, value)),
    [diagnostics, typeFile, value],
  );
  const api: FormApi = {
    canEdit,
    catalog,
    typeFile,
    id,
    problemsAt: (pointer) => routed.get(pointer) ?? [],
    set: (path, next, label) =>
      void editing.edit(
        `Edit ${label} in ${id}`,
        (copy) => changeRecord(copy, file, (now) => setIn(now, path, next, typeFile)),
        `${file}#${pointerOf(path)}`,
      ),
    update: (path, change, said) =>
      void editing.edit(`${said} in ${id}`, (copy) =>
        changeRecord(copy, file, (now) => setIn(now, path, change(getIn(now, path)), typeFile)),
      ),
  };
  const fields = Object.entries(typeFile.fields);
  const unknown =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.keys(value).filter((key) => !Object.hasOwn(typeFile.fields, key))
      : [];
  // Unknown keys get their own rows below, with a way to remove them.
  const strays = new Set(unknown.map((key) => `/${pointerSegment(key)}`));
  const top = (routed.get('') ?? []).filter((d) => !strays.has(d.path));
  return (
    <FormContext.Provider value={api}>
      <section class="record-form" aria-label={`${typeFile.title} ${id}`}>
        <RecordHead title={`${typeFile.title}: ${id}`} id={id} file={file} />
        {typeFile.description ? <p class="muted">{typeFile.description}</p> : null}
        <RecordProblems
          problems={top}
          unknown={unknown}
          remove={(key) => api.update([key], () => undefined, `Remove “${key}”`)}
          canEdit={canEdit}
        />
        {fields.map(([name, def]) => (
          <FieldView
            key={name}
            label={labelOf(name, def)}
            def={def}
            info={def}
            path={[name]}
            value={typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[name] : undefined}
          />
        ))}
      </section>
    </FormContext.Provider>
  );
}

/** What is wrong with the record as a whole, and the keys its type doesn't list, each removable. */
function RecordProblems(props: {
  problems: readonly Diagnostic[];
  unknown: readonly string[];
  remove: (key: string) => void;
  canEdit: boolean;
}) {
  const { problems, unknown, remove, canEdit } = props;
  if (problems.length === 0 && unknown.length === 0) return null;
  return (
    <div class="record-problems">
      {problems.map((problem) => (
        <p key={`${problem.path}${problem.message}`} class="field-problem">
          {problem.path ? `${problem.path}: ` : ''}
          {problem.message}
        </p>
      ))}
      {unknown.map((key) => (
        <div key={key} class="form-actions">
          <p class="field-problem">The type has no field “{key}”.</p>
          <button type="button" class="button" disabled={!canEdit} onClick={() => remove(key)}>
            Remove “{key}”
          </button>
        </div>
      ))}
    </div>
  );
}
