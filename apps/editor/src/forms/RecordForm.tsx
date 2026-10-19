import { pointerSegment, SHEET } from '@eb/core';
import { DIALOGUE, TALK } from '@eb/kits';
import type { DataType, Diagnostic } from '@eb/schema';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { TalkMap } from '../dialogue/TalkMap.tsx';
import { editing } from '../editing/current.ts';
import { SheetRows } from '../logic/SheetRows.tsx';
import type { OpenProject } from '../projects/opened.ts';
import { duplicateRecord } from '../records/actions.ts';
import { NameRecord } from '../records/NameRecord.tsx';
import { copyName, nameIn, namesOf } from '../records/names.ts';
import { RenameRecord } from '../records/RenameRecord.tsx';
import { UsedBy } from '../records/UsedBy.tsx';
import { recordFile } from './catalog.ts';
import { FieldView } from './FieldView.tsx';
import { fieldToFocus, focusField } from './focusField.ts';
import { type FormApi, FormContext, pointerOf } from './formContext.ts';
import { labelOf } from './labels.ts';
import { checkRecord, fieldPointers, routeProblems } from './problems.ts';
import { changeRecord, deleteRecordFile } from './recordEdits.ts';
import { useFile } from './useFile.ts';
import { getIn, setIn } from './values.ts';

/** The inspector's form for one record, or what stands in the way of one. */
export function RecordForm({ project, type, id }: { project: OpenProject; type: string; id: string }) {
  const file = recordFile(type, id);
  const loaded = useFile(project, file);
  const data = project.catalog.types.get(type);
  const broken = project.catalog.broken.get(type);
  if (!data) {
    return (
      <Notice project={project} type={type} title={type} id={id} file={file}>
        {broken
          ? `Its type file has a problem, so it can’t be edited here until that is fixed: ${broken.file}: ${broken.message}`
          : `There is no types/${type}.json, so this record can’t be checked or edited here.`}
      </Notice>
    );
  }
  if (loaded === null) return null;
  if (loaded.kind === 'missing') {
    return (
      <Notice project={project} type={type} title={data.file.title} id={id}>
        This record isn’t there any more: it was undone or deleted.
      </Notice>
    );
  }
  if (loaded.kind === 'unreadable') {
    return (
      <Notice project={project} type={type} title={data.file.title} id={id} file={file}>
        {`${file} can’t be read, so it can’t be edited here: ${loaded.message}`}
      </Notice>
    );
  }
  return <Form project={project} data={data} id={id} value={loaded.value} />;
}

function Notice(props: {
  project: OpenProject;
  type: string;
  title: string;
  id: string;
  file?: string;
  children: string;
}) {
  const { project, type, title, id, file, children } = props;
  return (
    <section class="record-form" aria-label={`${title} ${id}`}>
      <RecordHead title={`${title}: ${id}`} id={id} file={file} />
      <p class="muted">{children}</p>
      {/* A record that is gone may still be referred to: its users are where to look. */}
      <UsedBy project={project} type={type} id={id} />
    </section>
  );
}

/**
 * The record's name, Duplicate (M2.5), Rename (M2.6) and Delete: each a step like any edit, which
 * undo takes back. Duplicate asks for the copy's name, as New does; Rename for the new id.
 */
function RecordHead(props: { title: string; id: string; file?: string | undefined; copy?: Copying }) {
  const { title, id, file, copy } = props;
  const canEdit = editing.access.value.kind === 'editing';
  const [doing, setDoing] = useState<'duplicate' | 'rename' | null>(null);
  const duplicate = useRef<HTMLButtonElement>(null);
  const rename = useRef<HTMLButtonElement>(null);
  const close = (focus: HTMLButtonElement | null) => {
    setDoing(null);
    focus?.focus();
  };
  return (
    <>
      <header class="record-head">
        <h3>{title}</h3>
        {copy && canEdit ? (
          <>
            <button ref={duplicate} type="button" class="button" onClick={() => setDoing('duplicate')}>
              Duplicate
            </button>
            <button ref={rename} type="button" class="button" onClick={() => setDoing('rename')}>
              Rename
            </button>
          </>
        ) : null}
        {file ? (
          <button
            type="button"
            class="button danger"
            disabled={!canEdit}
            onClick={() => void editing.edit(`Delete ${id}`, (c) => deleteRecordFile(c, file))}
          >
            Delete
          </button>
        ) : null}
      </header>
      {doing === 'duplicate' && copy ? (
        <NameRecord
          type={copy.data.type}
          ids={copy.ids}
          label={`Name of the copy of ${id}`}
          action="Duplicate"
          initial={copyName(copy.name ?? id, copy.ids)}
          done={(to, typed) => {
            setDoing(null);
            duplicateRecord(copy.data, id, to, typed);
          }}
          cancel={() => close(duplicate.current)}
        />
      ) : null}
      {doing === 'rename' && copy ? (
        <RenameRecord project={copy.project} type={copy.data.type} id={id} close={() => close(rename.current)} />
      ) : null}
    </>
  );
}

/** What Duplicate and Rename need: the project, the record's type, the ids taken, and its name, if it has one. */
interface Copying {
  readonly project: OpenProject;
  readonly data: DataType;
  readonly ids: readonly string[];
  readonly name: string | undefined;
}

function Form({ project, data, id, value }: { project: OpenProject; data: DataType; id: string; value: unknown }) {
  const { catalog } = project;
  const { file: typeFile, type } = data;
  const file = recordFile(type, id);
  const section = useRef<HTMLElement>(null);
  const focusing = fieldToFocus.value;
  useEffect(() => {
    if (focusing?.file !== file || !section.current) return;
    const root = section.current;
    fieldToFocus.value = null;
    // After the sheet or the dock has moved focus into the inspector, which it does a frame on.
    requestAnimationFrame(() => requestAnimationFrame(() => focusField(root, focusing.at)));
  }, [focusing, file]);
  const canEdit = editing.access.value.kind === 'editing';
  const index = project.index ?? undefined;
  const diagnostics = useMemo(() => checkRecord(catalog, type, id, value, index), [catalog, type, id, value, index]);
  const routed = useMemo(
    () => routeProblems(diagnostics, fieldPointers(typeFile, value)),
    [diagnostics, typeFile, value],
  );
  const api: FormApi = {
    canEdit,
    catalog,
    names: namesOf(project.index, catalog),
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
      <section ref={section} class="record-form" aria-label={`${typeFile.title} ${id}`}>
        <RecordHead
          title={`${typeFile.title}: ${id}`}
          id={id}
          file={file}
          copy={{ project, data, ids: catalog.records.get(type) ?? [], name: nameIn(typeFile, value) }}
        />
        {typeFile.description ? <p class="muted">{typeFile.description}</p> : null}
        <RecordProblems
          problems={top}
          unknown={unknown}
          remove={(key) => api.update([key], () => undefined, `Remove “${key}”`)}
          canEdit={canEdit}
        />
        {/* A talk gets its map above its fields (M3.8): with the kit off, "talk" is a project's own type. */}
        {type === TALK && catalog.kits.includes(DIALOGUE) ? <TalkMap value={value} file={file} /> : null}
        {fields.map(([name, def]) => {
          const held =
            typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[name] : undefined;
          // A sheet's rows get the sheet editor (M3.1); its type file only sketches them.
          if (type === SHEET && name === 'rows') return <SheetRows key={name} value={held} />;
          return <FieldView key={name} label={labelOf(name, def)} def={def} info={def} path={[name]} value={held} />;
        })}
        <UsedBy project={project} type={type} id={id} />
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
