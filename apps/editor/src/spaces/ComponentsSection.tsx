/**
 * An object's own components in its form (M5.2, D64): each kind's fields as a form, with Remove,
 * and Add a component for a kind it hasn't got. A component of a kind there is no file for says so,
 * and can still be taken away.
 */
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import { namesOf } from '../records/names.ts';
import { editOpen } from './actions.ts';
import { AddComponent, PartFields } from './PartFields.tsx';
import { addComponent, removeComponent } from './partEdits.ts';
import type { PartForm } from './partForm.ts';
import { nameOf, type SpaceObject } from './spaceFile.ts';

/** What every part's form of an object in the open file shares. */
export function formBase(project: OpenProject, file: string, index: number) {
  return {
    file,
    index,
    canEdit: editing.access.value.kind === 'editing',
    catalog: project.catalog,
    names: namesOf(project.index, project.catalog),
    problems: project.index?.spaces ?? [],
  } satisfies Partial<PartForm>;
}

export function ComponentsSection(props: { project: OpenProject; file: string; index: number; object: SpaceObject }) {
  const { project, file, index, object } = props;
  const base = formBase(project, file, index);
  const kinds = project.catalog.components;
  const own = Object.entries(object.components ?? {});
  return (
    <section class="part-section" aria-label={`Components of ${nameOf(object)}`}>
      <h4>Components</h4>
      {own.length === 0 ? (
        <p class="muted">None: a component makes the object a light, a zone, a spawn point…</p>
      ) : null}
      {own.map(([kind, fields]) => {
        const type = kinds.get(kind);
        const title = type?.file.title ?? kind;
        return (
          <fieldset key={kind} class="part-box">
            <legend>{title}</legend>
            {type ? (
              <PartFields
                form={{
                  ...base,
                  part: { kind: 'component', object: object.id, component: kind },
                  typeFile: type.file,
                  value: fields,
                  title: `${kind} of ${object.id}`,
                }}
              />
            ) : (
              <p class="field-problem">No component kind “{kind}”: the engine has none, nor has components/.</p>
            )}
            {base.canEdit ? (
              <button
                type="button"
                class="button"
                onClick={() =>
                  void editOpen(`Remove ${kind} from ${object.id}`, (s) => removeComponent(s, object.id, kind))
                }
              >
                Remove {title}
              </button>
            ) : null}
          </fieldset>
        );
      })}
      {base.canEdit ? (
        <AddComponent
          kinds={kinds}
          has={own.map(([kind]) => kind)}
          add={(kind, type) =>
            void editOpen(`Add ${kind} to ${object.id}`, (s) => addComponent(s, object.id, kind, type.file))
          }
        />
      ) : null}
    </section>
  );
}
