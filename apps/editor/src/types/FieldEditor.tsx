import { pointerSegment } from '@eb/core';
import { fieldNameProblem, type ValueDef } from '@eb/schema';
import { useRef, useState } from 'preact/hooks';
import { FieldView } from '../forms/FieldView.tsx';
import { FormContext } from '../forms/formContext.ts';
import { LocalField } from '../forms/LocalField.tsx';
import { humanize } from '../forms/labels.ts';
import { emptyValue } from '../forms/values.ts';
import { namesOf } from '../records/names.ts';
import { type DefPath, fieldNames, isObject, kindOf, valuesAt } from './defPaths.ts';
import { designForm, useDesign } from './designContext.ts';
import { fillChange, removeFieldChange, renameFieldChange } from './fieldEdits.ts';
import { fieldLabel } from './kinds.ts';
import { RenameForm } from './RenameForm.tsx';
import { missingField } from './rewrites.ts';
import { Problems } from './TypeDesigner.tsx';
import { KindSelect, ValueOptions } from './ValueOptions.tsx';

const pointer = (path: DefPath) => path.map((key) => `/${pointerSegment(key)}`).join('');
const records = (count: number) => (count === 1 ? '1 record' : `${count} records`);

/** How many of the type's records hold the field `name` of the group at `group`, in some object of it. */
function holding(design: ReturnType<typeof useDesign>, group: DefPath, name: string): number {
  return design.records.filter(({ value }) =>
    valuesAt(design.json, group, value).some((object) => isObject(object) && Object.hasOwn(object, name)),
  ).length;
}

/**
 * One field opened: its name, kind, label, help and whether records may leave it out, then what
 * its kind holds. Renaming it renames it in every record, removing it removes it from them (D33),
 * and a required field records leave out can be filled in on them all, each as one step.
 */
export function FieldEditor(props: { group: DefPath; name: string; def: unknown; renamed: (to: string) => void }) {
  const { group, name, def, renamed } = props;
  const design = useDesign();
  const path = [...group, 'fields', name];
  const label = fieldLabel(name, def);
  const info = isObject(def) ? def : {};
  return (
    <section class="field-editor" aria-label={`Field ${name}`}>
      <Problems problems={design.problemsAt(pointer(path))} />
      <FieldName group={group} name={name} renamed={renamed} />
      <KindSelect path={path} label={label} field />
      <FormContext.Provider value={designForm(design, path, `${name} in type ${design.type}`)}>
        <FieldView
          label="Label"
          def={{ kind: 'text', min: 1 }}
          info={{ optional: true, description: `Forms say “${humanize(name)}” without one.` }}
          path={['label']}
          value={info.label}
        />
        <FieldView
          label="Help"
          def={{ kind: 'text', multiline: true }}
          info={{ optional: true }}
          path={['description']}
          value={info.description}
        />
        <FieldView
          label="Optional"
          def={{ kind: 'bool' }}
          info={{ description: 'Records may leave it out.' }}
          path={['optional']}
          value={info.optional}
        />
      </FormContext.Provider>
      <ValueOptions path={path} label={label} />
      {info.optional !== true && kindOf(def) ? (
        <FillMissing group={group} name={name} def={def as ValueDef} label={label} />
      ) : null}
      {group.length === 0 ? <FieldFit name={name} label={label} /> : null}
      {design.canEdit ? <RemoveField group={group} name={name} label={label} /> : null}
    </section>
  );
}

/** The name records hold the field under, with Rename. */
function FieldName({ group, name, renamed }: { group: DefPath; name: string; renamed: (to: string) => void }) {
  const design = useDesign();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const taken = fieldNames(design.json, group);
  return (
    <div class="form-field">
      <div class="form-label-row">
        <p class="form-label">
          Name in the files: <span class="mono">{name}</span>
        </p>
        {design.canEdit && !open ? (
          <button
            ref={button}
            type="button"
            class="button"
            aria-label={`Rename the field ${name}`}
            onClick={() => setOpen(true)}
          >
            Rename
          </button>
        ) : null}
      </div>
      {open ? (
        <RenameForm
          label={`New name for the field ${name}`}
          initial={name}
          check={(typed) =>
            fieldNameProblem(typed) ?? (taken.includes(typed) ? `There is a field ${typed} already` : null)
          }
          said={() => {
            const count = holding(design, group, name);
            return count === 0 ? 'No record holds it yet.' : `Renamed in the ${records(count)} that hold it too.`;
          }}
          done={(to) => {
            setOpen(false);
            void design
              .change(`Rename field ${name} to ${to} in type ${design.type}`, renameFieldChange(group, name, to))
              .then((made) => {
                if (made) renamed(to);
              });
          }}
          cancel={() => {
            setOpen(false);
            button.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

/** A required field some records leave out: a value to give them all, as one step (type-files.md, question 3). */
function FillMissing({ group, name, def, label }: { group: DefPath; name: string; def: ValueDef; label: string }) {
  const design = useDesign();
  const missing = design.records.filter(({ value }) => missingField(design.json, group, name, value) > 0).length;
  const [value, setValue] = useState<unknown>(() => emptyValue(def));
  if (missing === 0 || !design.canEdit) return null;
  return (
    <div class="fill-missing">
      <p>
        {records(missing)} {missing === 1 ? 'leaves' : 'leave'} {label} out. Give {missing === 1 ? 'it' : 'them'}:
      </p>
      <LocalField
        catalog={design.project.catalog}
        names={namesOf(design.project.index, design.project.catalog)}
        label={`${label} for the records that leave it out`}
        def={def}
        value={value}
        change={(next) => setValue(next)}
      />
      <button
        type="button"
        class="button primary"
        disabled={value === undefined}
        onClick={() => void design.change(`Fill in ${label} on ${records(missing)}`, fillChange(group, name, value))}
      >
        Fill in {records(missing)}
      </button>
    </div>
  );
}

/** How many records don't fit a field of the type, from the index: after a change of kind, say. */
function FieldFit({ name, label }: { name: string; label: string }) {
  const { records: all } = useDesign();
  const at = `/${pointerSegment(name)}`;
  const count = all.filter((record) =>
    record.problems.some((p) => p.path === at || p.path.startsWith(`${at}/`)),
  ).length;
  if (count === 0) return null;
  return (
    <p class="field-problem">
      {records(count)} {count === 1 ? 'doesn’t' : 'don’t'} fit {label}: the table shows {count === 1 ? 'it' : 'them'}{' '}
      with problems.
    </p>
  );
}

/** Removing asks first, saying how many records lose a value. */
function RemoveField({ group, name, label }: { group: DefPath; name: string; label: string }) {
  const design = useDesign();
  const [asking, setAsking] = useState(false);
  const count = holding(design, group, name);
  if (!asking) {
    return (
      <button type="button" class="button danger" onClick={() => setAsking(true)}>
        Remove {label}
      </button>
    );
  }
  return (
    <div class="confirm">
      <p>
        Remove {label}?{' '}
        {count === 0
          ? 'No record holds it.'
          : `It goes from the ${records(count)} that hold it too; undo brings it back.`}
      </p>
      <div class="form-actions">
        <button
          type="button"
          class="button danger"
          onClick={() =>
            void design.change(`Remove field ${name} from type ${design.type}`, removeFieldChange(group, name))
          }
        >
          Remove {label}
        </button>
        <button type="button" class="button" onClick={() => setAsking(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
