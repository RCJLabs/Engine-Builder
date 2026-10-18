import type { Diagnostic } from '@eb/schema';
import { useMemo } from 'preact/hooks';
import { showPanel } from '../app/panelControl.ts';
import { editing } from '../editing/current.ts';
import { FieldView } from '../forms/FieldView.tsx';
import { FormContext } from '../forms/formContext.ts';
import { humanize } from '../forms/labels.ts';
import { useFile } from '../forms/useFile.ts';
import type { OpenProject } from '../projects/opened.ts';
import { setView, tableType } from '../records/viewState.ts';
import { isObject } from './defPaths.ts';
import { type Design, DesignContext, designForm, useDesign } from './designContext.ts';
import { routedProblems } from './designProblems.ts';
import { FieldList } from './FieldList.tsx';
import { TypeHead } from './TypeHead.tsx';
import { changeTypeStep, createType } from './typeActions.ts';
import { typeFilePath } from './typeEdits.ts';
import '../styles/types.css';

export { NewType } from './NewType.tsx';

/** The inspector's designer for one type (M2.6): its file, its fields and its records, or what stands in the way. */
export function TypeDesigner({ project, type }: { project: OpenProject; type: string }) {
  const file = typeFilePath(type);
  const loaded = useFile(project, file);
  if (loaded === null) return null;
  if (loaded.kind === 'missing') return <Missing project={project} type={type} />;
  if (loaded.kind === 'unreadable') {
    return (
      <section class="type-designer" aria-label={`Type ${type}`}>
        <h3>Type: {type}</h3>
        <p class="field-problem">{`${file} can’t be read, so it can’t be designed here: ${loaded.message}`}</p>
      </section>
    );
  }
  return <Designer project={project} type={type} file={file} json={loaded.value} />;
}

/** No type file: undone or deleted, or records whose type was never written down. */
function Missing({ project, type }: { project: OpenProject; type: string }) {
  const count = project.catalog.records.get(type)?.length ?? 0;
  const canEdit = editing.access.value.kind === 'editing';
  return (
    <section class="type-designer" aria-label={`Type ${type}`}>
      <h3>Type: {type}</h3>
      {count === 0 ? (
        <p class="muted">This type isn’t there any more: it was undone or deleted.</p>
      ) : (
        <>
          <p class="muted">
            There is no types/{type}.json, so its {count === 1 ? 'record' : `${count} records`} can’t be checked.
          </p>
          <p class="muted">
            It starts with no fields: its records’ keys show as problems until fields of those names are added.
          </p>
          <button
            type="button"
            class="button"
            disabled={!canEdit}
            onClick={() => void createType(type, humanize(type), { title: humanize(type), fields: {} })}
          >
            Create types/{type}.json
          </button>
        </>
      )}
    </section>
  );
}

const textOf = (json: unknown, key: string): string | undefined =>
  isObject(json) && typeof json[key] === 'string' ? (json[key] as string) : undefined;

function Designer({ project, type, file, json }: { project: OpenProject; type: string; file: string; json: unknown }) {
  const { catalog, index } = project;
  const canEdit = editing.access.value.kind === 'editing';
  const types = useMemo(() => [...new Set([...catalog.types.keys(), ...catalog.broken.keys()])].sort(), [catalog]);
  const routed = useMemo(() => routedProblems(json, types, file), [json, types, file]);
  const records = useMemo(
    () => (index ? [...index.records.values()].filter((record) => record.type === type) : []),
    [index, type],
  );
  const title = textOf(json, 'title') || type;
  const design: Design = {
    project,
    type,
    file,
    json,
    title,
    canEdit,
    problemsAt: (pointer) => routed.get(pointer) ?? [],
    troubled: [...routed.keys()],
    records,
    types,
    titleOf: (name) => catalog.types.get(name)?.file.title ?? name,
    change: (label, change, group) => changeTypeStep(type, label, change, group),
  };
  return (
    <DesignContext.Provider value={design}>
      <section class="type-designer" aria-label={`Type ${title}`}>
        <TypeHead />
        <Problems problems={design.problemsAt('')} />
        <TypeInfo />
        <FieldList group={[]} />
        <RecordsLine />
      </section>
    </DesignContext.Provider>
  );
}

export function Problems({ problems }: { problems: readonly Diagnostic[] }) {
  if (problems.length === 0) return null;
  return (
    <div class="form-problems">
      {problems.map((problem) => (
        <p key={`${problem.path}${problem.message}`} class="field-problem">
          {problem.message}
        </p>
      ))}
    </div>
  );
}

/** The type's title and description, and the field its records are named by. */
function TypeInfo() {
  const design = useDesign();
  const { json } = design;
  const fields = isObject(json) && isObject(json.fields) ? json.fields : {};
  const texts = Object.entries(fields)
    .filter(([, def]) => isObject(def) && def.kind === 'text')
    .map(([name]) => name);
  return (
    <FormContext.Provider value={designForm(design, [], `type ${design.type}`)}>
      <FieldView
        label="Title"
        def={{ kind: 'text', min: 1 }}
        info={{}}
        path={['title']}
        value={textOf(json, 'title')}
      />
      <FieldView
        label="Description"
        def={{ kind: 'text', multiline: true }}
        info={{ optional: true }}
        path={['description']}
        value={textOf(json, 'description')}
      />
      <FieldView
        label="Records are named by"
        def={{ kind: 'enum', values: texts }}
        info={{ optional: true, description: 'A text field. Tables and pickers show it beside each record’s id.' }}
        path={['nameField']}
        value={isObject(json) ? json.nameField : undefined}
      />
    </FormContext.Provider>
  );
}

/** How many records the type has, how many have problems, and the way to them in the table. */
function RecordsLine() {
  const { type, records, project } = useDesign();
  const count = project.catalog.records.get(type)?.length ?? 0;
  const troubled = records.filter((record) => record.problems.length > 0).length;
  const show = (problems: boolean) => {
    tableType.value = type;
    if (problems)
      setView(type, (view) => ({ ...view, filters: [{ key: -1, column: 'problems', test: 'any', value: '' }] }));
    showPanel('records');
  };
  return (
    <div class="type-records">
      <p>
        {count === 1 ? '1 record' : `${count} records`}
        {troubled > 0 ? `, ${troubled === 1 ? '1 has problems' : `${troubled} have problems`}` : ''}.
      </p>
      <div class="form-actions">
        <button type="button" class="button" onClick={() => show(false)}>
          Show the records
        </button>
        {troubled > 0 ? (
          <button type="button" class="button" onClick={() => show(true)}>
            Show those with problems
          </button>
        ) : null}
      </div>
    </div>
  );
}
