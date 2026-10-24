/**
 * The type designer on a project's own component kind (M5.2, D64): components/<kind>.json, its
 * title, description and fields, edited as a record type's are, each change one step with every
 * component of the kind in spaces and prefabs rewritten to match (spaces/kindEdits.ts). Rename and
 * Delete take the components with them.
 */
import { componentPath } from '@eb/compiler';
import { isRecordId } from '@eb/core';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { step } from '../editing/step.ts';
import { FieldView } from '../forms/FieldView.tsx';
import { FormContext } from '../forms/formContext.ts';
import { slugify } from '../forms/labels.ts';
import { chosen } from '../forms/selection.ts';
import { useFile } from '../forms/useFile.ts';
import { type OpenProject, revision } from '../projects/opened.ts';
import { changeKind, deleteKind, renameKind, valuesOfKind } from '../spaces/kindEdits.ts';
import { isObject } from './defPaths.ts';
import { type Design, DesignContext, designForm, type Holder, useDesign } from './designContext.ts';
import { routedProblems } from './designProblems.ts';
import { FieldList } from './FieldList.tsx';
import { RenameForm } from './RenameForm.tsx';
import { Problems } from './TypeDesigner.tsx';
import '../styles/types.css';

export function KindDesigner({ project, kind }: { project: OpenProject; kind: string }) {
  const file = componentPath(kind);
  const loaded = useFile(project, file);
  if (loaded === null) return null;
  if (loaded.kind !== 'ok') {
    return (
      <section class="type-designer" aria-label={`Component kind ${kind}`}>
        <h3>Component kind: {kind}</h3>
        <p class={loaded.kind === 'missing' ? 'muted' : 'field-problem'}>
          {loaded.kind === 'missing'
            ? 'This kind isn’t there any more: it was undone or deleted.'
            : `${file} can’t be read, so it can’t be designed here: ${loaded.message}`}
        </p>
      </section>
    );
  }
  return <Designer project={project} kind={kind} file={file} json={loaded.value} />;
}

/** The objects' own components of the kind, read again after every change: what a required field fills, and the counts. */
function useHolders(project: OpenProject, kind: string): Holder[] {
  const [holders, setHolders] = useState<Holder[]>([]);
  const changes = revision.value;
  useEffect(() => {
    let gone = false;
    void valuesOfKind(project.source, kind).then((found) => {
      if (!gone) setHolders(found.filter((f) => f.whole).map(({ value }) => ({ value, problems: [] })));
    });
    return () => {
      gone = true;
    };
  }, [project.source, kind, changes]);
  return holders;
}

const textOf = (json: unknown, key: string): string | undefined =>
  isObject(json) && typeof json[key] === 'string' ? (json[key] as string) : undefined;

function Designer(props: { project: OpenProject; kind: string; file: string; json: unknown }) {
  const { project, kind, file, json } = props;
  const { catalog } = project;
  const types = useMemo(() => [...new Set([...catalog.types.keys(), ...catalog.broken.keys()])].sort(), [catalog]);
  const routed = useMemo(() => routedProblems(json, types, file), [json, types, file]);
  const holders = useHolders(project, kind);
  const title = textOf(json, 'title') || kind;
  const design: Design = {
    project,
    type: kind,
    file,
    json,
    title,
    canEdit: editing.access.value.kind === 'editing',
    problemsAt: (pointer) => routed.get(pointer) ?? [],
    troubled: [...routed.keys()],
    records: holders,
    types,
    titleOf: (name) => catalog.types.get(name)?.file.title ?? name,
    change: (label, change, group) => step(label, (copy) => changeKind(copy, kind, change), group),
  };
  return (
    <DesignContext.Provider value={design}>
      <section class="type-designer" aria-label={`Component kind ${title}`}>
        <KindHead />
        <Problems problems={design.problemsAt('')} />
        <FormContext.Provider value={designForm(design, [], `component kind ${kind}`)}>
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
        </FormContext.Provider>
        <FieldList group={[]} />
        <p class="type-records">
          {holders.length === 1 ? '1 object carries one' : `${holders.length} objects carry one`} in spaces and prefabs.
        </p>
      </section>
    </DesignContext.Provider>
  );
}

/** The kind's name and file, with Rename and Delete: each one step with its components, which undo takes back. */
function KindHead() {
  const { type: kind, title, file, canEdit, project, records } = useDesign();
  const [doing, setDoing] = useState<'rename' | 'delete' | null>(null);
  const rename = useRef<HTMLButtonElement>(null);
  const del = useRef<HTMLButtonElement>(null);
  const close = (focus: HTMLButtonElement | null) => {
    setDoing(null);
    focus?.focus();
  };
  const taken = new Set([...project.catalog.components.keys(), ...project.catalog.componentFiles]);
  return (
    <>
      <header class="record-head">
        <h3>Component kind: {title}</h3>
        {canEdit ? (
          <>
            <button ref={rename} type="button" class="button" onClick={() => setDoing('rename')}>
              Rename
            </button>
            <button ref={del} type="button" class="button danger" onClick={() => setDoing('delete')}>
              Delete
            </button>
          </>
        ) : null}
      </header>
      <p class="muted mono">{file}</p>
      {doing === 'rename' ? (
        <RenameForm
          label={`New name for the component kind ${kind}`}
          initial={kind}
          shape={slugify}
          check={(name) =>
            !isRecordId(name)
              ? 'Use letters or digits'
              : taken.has(name) && name !== kind
                ? `There is a kind ${name} already`
                : null
          }
          said={(name) => `Saved as components/${name}.json; its components follow.`}
          done={(name) => {
            setDoing(null);
            void step(`Rename component kind ${kind} to ${name}`, (copy) => renameKind(copy, kind, name)).then(
              (made) => {
                if (made) chosen.value = { kind: 'component', id: name };
              },
            );
          }}
          cancel={() => close(rename.current)}
        />
      ) : null}
      {doing === 'delete' ? (
        <div class="confirm">
          <p>
            Delete {title} and {records.length === 1 ? 'the 1 component' : `the ${records.length} components`} of it?
            Undo brings them back.
          </p>
          <div class="form-actions">
            <button
              type="button"
              class="button danger"
              onClick={() =>
                void step(`Delete component kind ${title}`, (copy) => deleteKind(copy, kind)).then((made) => {
                  if (made) chosen.value = null;
                })
              }
            >
              Delete {title}
            </button>
            <button type="button" class="button" onClick={() => close(del.current)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
