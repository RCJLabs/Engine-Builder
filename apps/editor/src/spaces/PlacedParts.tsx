/**
 * What a placement's form adds (M5.2, D64, docs/specs/components.md): a placed record's fields as
 * they stand here, each overridden one with Revert; a placed prefab's objects, each opening its own
 * form; and that form, whose every change is an override of this placement, the prefab untouched.
 */

import { recordHere, SHAPES } from '@eb/compiler';
import { parseRef } from '@eb/core';
import { useUniqueId } from '../app/ids.ts';
import { newGroup } from '../forms/values.ts';
import type { OpenProject } from '../projects/opened.ts';
import { openRecord } from '../records/actions.ts';
import { namesOf } from '../records/names.ts';
import { editOpen } from './actions.ts';
import { formBase } from './ComponentsSection.tsx';
import { TextBox, Triple, withAxis } from './ObjectFields.tsx';
import { AddComponent, PartFields } from './PartFields.tsx';
import { insideOf, recordOverridesHere, setOverride } from './partEdits.ts';
import { tidy } from './snap.ts';
import { GREY, nameOf, type SpaceJson, type SpaceObject, transformOf } from './spaceFile.ts';
import { inside as insideSignal } from './state.ts';
import { TagsField } from './TagsField.tsx';
import { projectTags } from './tags.ts';
import type { Vec3 } from './vec.ts';

interface Placement {
  readonly project: OpenProject;
  readonly file: string;
  readonly index: number;
  /** The object of the open file the form is of. */
  readonly placement: SpaceObject;
  readonly prefabs: ReadonlyMap<string, SpaceJson>;
  /** Down through the prefabs to the object shown: none for the placement itself. */
  readonly inside: readonly string[];
}

const revertOne = (p: Placement, path: (string | number)[], what: string) =>
  void editOpen(`Revert ${what} of ${[p.placement.id, ...p.inside].join(' › ')}`, (space) =>
    setOverride(space, p.placement.id, p.inside, path, undefined),
  );

/** A placed record's fields here: the record's, with what this placement changes laid over them. */
export function RecordHere(props: Placement & { readonly record: string }) {
  const { project, record } = props;
  const key = parseRef(record);
  const type = key ? project.catalog.types.get(key.type) : undefined;
  const indexed = project.index?.records.get(record);
  const shown = insideOf(props.placement, props.prefabs, props.inside);
  const here = recordOverridesHere(props.placement, props.inside);
  const name = namesOf(project.index, project.catalog)(record) ?? key?.id ?? record;
  return (
    <section class="part-section" aria-label={`${name} here`}>
      <p>
        Places <strong>{name}</strong> <span class="muted">({record})</span>
        {indexed ? null : ', which the project doesn’t have'}.
      </p>
      {key && indexed ? (
        <button type="button" class="button" onClick={() => openRecord(key.type, key.id)}>
          Open record
        </button>
      ) : null}
      {type && indexed && shown ? (
        <>
          <h4>Here</h4>
          <p class="muted">A change here is this placement’s: the record stays as it is.</p>
          <PartFields
            form={{
              ...formBase(project, props.file, props.index),
              part: { kind: 'override', object: props.placement.id, inside: props.inside, under: ['overrides'] },
              typeFile: type.file,
              value: recordHere(indexed.value, [...shown.passed]),
              title: [props.placement.id, ...props.inside].join(' › '),
            }}
            overridden={(field) => here[field] !== undefined}
            revert={(field) => revertOne(props, ['overrides', field], field)}
          />
        </>
      ) : key && indexed ? (
        <p class="muted">Its type has no type file, so its fields can’t be changed here.</p>
      ) : null}
    </section>
  );
}

/** The objects of the prefab the object at `inside` places, each opening its form. */
export function InsideList(props: Placement) {
  const heading = useUniqueId();
  const shown = insideOf(props.placement, props.prefabs, props.inside);
  const prefab = shown?.object.prefab === undefined ? undefined : props.prefabs.get(shown.object.prefab);
  if (!prefab) return null;
  return (
    <section class="part-section" aria-labelledby={heading}>
      <h4 id={heading}>Inside</h4>
      <p class="muted">Change one of {prefab.name}’s objects for this placement alone.</p>
      <ul class="outliner">
        {prefab.objects.map((object) => {
          const changed = insideOf(props.placement, props.prefabs, [...props.inside, object.id])?.here !== undefined;
          return (
            <li key={object.id} class="outliner-item">
              <button
                type="button"
                class="outliner-row"
                onClick={() => {
                  insideSignal.value = [...props.inside, object.id];
                }}
              >
                <span class="outliner-name">{nameOf(object)}</span>{' '}
                <span class="muted">{changed ? 'changed here' : (object.shape ?? object.prefab ?? object.record)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** An object inside a placement: its place, looks and components as this placement shows them, each change an override. */
export function InsideObject(props: Placement) {
  const shown = insideOf(props.placement, props.prefabs, props.inside);
  const base = formBase(props.project, props.file, props.index);
  const shapeId = useUniqueId();
  const colorId = useUniqueId();
  const nameId = useUniqueId();
  if (!shown) return <p class="muted">The prefab has no object {props.inside.join(' › ')} any more.</p>;
  const { object, here } = shown;
  const where = [props.placement.id, ...props.inside].join(' › ');
  const set = (field: string, value: unknown, what: string) =>
    void editOpen(
      `${what} of ${where}`,
      (space) => setOverride(space, props.placement.id, props.inside, [field], value),
      `${props.file}#${where}#${field}`,
    );
  const mark = (field: string, what: string) =>
    here?.[field] !== undefined ? (
      <p class="part-mark">
        <span>Changed here</span>
        {base.canEdit ? (
          <button
            type="button"
            class="button"
            aria-label={`Revert ${what}`}
            onClick={() => revertOne(props, [field], what)}
          >
            Revert
          </button>
        ) : null}
      </p>
    ) : null;
  const t = transformOf(object);
  const tidied = (v: Vec3) => v.map(tidy);
  const kinds = props.project.catalog.components;
  const components = Object.entries(object.components ?? {});
  return (
    <form class="object-form" onSubmit={(event) => event.preventDefault()}>
      <h3>{where}</h3>
      <button type="button" class="button" onClick={() => (insideSignal.value = props.inside.slice(0, -1))}>
        Back to {props.inside.length > 1 ? props.inside[props.inside.length - 2] : props.placement.id}
      </button>
      <p class="muted">A change here is this placement’s: the prefab and its other placements stay as they are.</p>
      <div class="form-field">
        <label for={nameId}>Name</label>
        <TextBox
          id={nameId}
          value={object.name ?? ''}
          canEdit={base.canEdit}
          write={(name) => set('name', name.trim() === '' ? undefined : name.slice(0, 80), 'Rename')}
        />
        {mark('name', 'name')}
      </div>
      <TagsField
        of={object.name ?? object.id}
        tags={object.tags ?? []}
        known={projectTags(props.project.index?.flagsElsewhere?.tags)}
        canEdit={base.canEdit}
        write={(tags) => set('tags', [...tags], 'Tags')}
      />
      {mark('tags', 'tags')}
      <Triple
        legend="Place, in metres"
        value={t.at}
        canEdit={base.canEdit}
        write={(axis, n) => set('at', tidied(withAxis(t.at, axis, n)), 'Move')}
      />
      {mark('at', 'place')}
      <Triple
        legend="Turn, in degrees"
        value={t.turn}
        canEdit={base.canEdit}
        write={(axis, n) => set('turn', tidied(withAxis(t.turn, axis, n)), 'Turn')}
      />
      {mark('turn', 'turn')}
      <Triple
        legend="Scale"
        value={t.scale}
        canEdit={base.canEdit}
        above={0}
        write={(axis, n) => set('scale', tidied(withAxis(t.scale, axis, n)), 'Scale')}
      />
      {mark('scale', 'scale')}
      {object.shape !== undefined ? (
        <>
          <div class="form-field">
            <label for={shapeId}>Shape</label>
            <select
              id={shapeId}
              class="field"
              value={object.shape}
              disabled={!base.canEdit}
              onChange={(e) => set('shape', e.currentTarget.value, 'Shape')}
            >
              {SHAPES.map((shape) => (
                <option key={shape} value={shape}>
                  {shape}
                </option>
              ))}
            </select>
            {mark('shape', 'shape')}
          </div>
          <div class="form-field">
            <label for={colorId}>Colour</label>
            <input
              id={colorId}
              class="field object-color"
              type="color"
              value={object.color ?? GREY}
              disabled={!base.canEdit}
              onInput={(e) => set('color', e.currentTarget.value, 'Colour')}
            />
            {mark('color', 'colour')}
          </div>
        </>
      ) : null}
      <section class="part-section" aria-label={`Components of ${where}`}>
        <h4>Components</h4>
        {components.length === 0 ? <p class="muted">None.</p> : null}
        {components.map(([kind, fields]) => {
          const type = kinds.get(kind);
          const changed = (here?.components as Record<string, Record<string, unknown>> | undefined)?.[kind];
          return (
            <fieldset key={kind} class="part-box">
              <legend>{type?.file.title ?? kind}</legend>
              {type ? (
                <PartFields
                  form={{
                    ...base,
                    part: {
                      kind: 'override',
                      object: props.placement.id,
                      inside: props.inside,
                      under: ['components', kind],
                    },
                    typeFile: type.file,
                    value: fields,
                    title: `${kind} of ${where}`,
                  }}
                  overridden={(field) => changed?.[field] !== undefined}
                  revert={(field) => revertOne(props, ['components', kind, field], `${kind} ${field}`)}
                />
              ) : (
                <p class="field-problem">No component kind “{kind}”.</p>
              )}
            </fieldset>
          );
        })}
        {base.canEdit ? (
          <AddComponent
            kinds={kinds}
            has={components.map(([kind]) => kind)}
            add={(kind, type) =>
              set(
                'components',
                { ...((here?.components as object) ?? {}), [kind]: newGroup(type.file.fields) },
                `Add ${kind}`,
              )
            }
          />
        ) : null}
      </section>
      {object.prefab !== undefined ? <InsideList {...props} /> : null}
      {object.record !== undefined ? <RecordHere {...props} record={object.record} /> : null}
    </form>
  );
}
