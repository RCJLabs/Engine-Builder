import { type FieldKind, fieldNameProblem, type ValueDef } from '@eb/schema';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { LocalField } from '../forms/LocalField.tsx';
import { fieldNameOf, humanize } from '../forms/labels.ts';
import { emptyValue } from '../forms/values.ts';
import { namesOf } from '../records/names.ts';
import { type DefPath, fieldNames, isObject, valuesAt } from './defPaths.ts';
import { useDesign } from './designContext.ts';
import { addFieldChange } from './fieldEdits.ts';
import { KIND_NAMES, KINDS } from './kinds.ts';
import { startingDef } from './typeFileChanges.ts';

const records = (count: number) => (count === 1 ? '1 record' : `${count} records`);

/** The choices typed, one a line: each once, blank lines left out. */
const choicesOf = (text: string) => [...new Set(text.split('\n').map((line) => line.trim()))].filter(Boolean);

/** Adding a field to the type or to a group: a button that opens the form. */
export function AddField({ group, added }: { group: DefPath; added: (name: string) => void }) {
  const design = useDesign();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  if (!design.canEdit) return null;
  if (!open) {
    return (
      <button ref={button} type="button" class="button" onClick={() => setOpen(true)}>
        Add a field
      </button>
    );
  }
  return (
    <FieldForm
      group={group}
      done={(name) => {
        setOpen(false);
        added(name);
      }}
      cancel={() => {
        setOpen(false);
        requestAnimationFrame(() => button.current?.focus());
      }}
    />
  );
}

/**
 * A new field's name, kind and what its kind can't do without (a choice's choices, the type a
 * ref names), and whether records may leave it out. A required field is filled in on the records
 * there are with a value chosen here, in the same step (type-files.md, question 3).
 */
function FieldForm({ group, done, cancel }: { group: DefPath; done: (name: string) => void; cancel: () => void }) {
  const design = useDesign();
  const id = useUniqueId();
  const box = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => box.current?.focus(), []);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FieldKind>('text');
  const [choices, setChoices] = useState('');
  const [target, setTarget] = useState(
    design.types.includes(design.type) ? design.type : (design.types[0] ?? design.type),
  );
  const [optional, setOptional] = useState(false);
  const typed = fieldNameOf(name);
  const problem =
    typed === ''
      ? null
      : (fieldNameProblem(typed) ??
        (fieldNames(design.json, group).includes(typed) ? `There is a field ${typed} already` : null));
  const def = useMemo(() => {
    const made = startingDef(kind, choicesOf(choices), target);
    return optional ? { ...made, optional: true } : made;
  }, [kind, choices, target, optional]);
  const needsChoices = kind === 'enum' && choicesOf(choices).length === 0;
  // The objects that will hold the field: the records themselves, or the groups in them.
  const holders = design.records.filter(({ value }) => valuesAt(design.json, group, value).some(isObject)).length;
  const fills = !optional && holders > 0;
  const [fill, setFill] = useState<{ key: string; value: unknown } | null>(null);
  const shape = JSON.stringify(def);
  // The fill value starts again whenever the field's shape changes, as the bulk edit's does per field.
  const value = fill?.key === shape ? fill.value : emptyValue(def as ValueDef);
  const ready = typed !== '' && problem === null && !needsChoices && (!fills || value !== undefined);
  return (
    <form
      class="add-field"
      aria-label="New field"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        void design
          .change(
            `Add field ${typed} to type ${design.type}`,
            addFieldChange(group, typed, def, fills ? { value } : undefined),
          )
          .then((made) => {
            if (made) done(typed);
          });
      }}
    >
      <label for={id}>Name of the new field</label>
      <input
        ref={box}
        id={id}
        class="field"
        value={name}
        autoComplete="off"
        autocapitalize="none"
        spellcheck={false}
        aria-invalid={problem ? 'true' : undefined}
        aria-describedby={`${id}-said`}
        onInput={(event) => setName(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancel();
        }}
      />
      <p id={`${id}-said`} class={problem ? 'field-problem' : 'form-help'}>
        {problem ??
          (typed
            ? `Forms call it “${humanize(typed)}”; records hold it as ${typed}.`
            : 'A letter, then letters, digits, “_” or “-”.')}
      </p>
      <label for={`${id}-kind`}>Kind</label>
      <select
        id={`${id}-kind`}
        class="field form-select"
        value={kind}
        onChange={(event) => setKind(event.currentTarget.value as FieldKind)}
      >
        {KINDS.map((each) => (
          <option key={each} value={each}>
            {KIND_NAMES[each]}
          </option>
        ))}
      </select>
      {kind === 'enum' ? (
        <>
          <label for={`${id}-choices`}>Choices, one a line</label>
          <textarea
            id={`${id}-choices`}
            class="field"
            rows={3}
            value={choices}
            onInput={(event) => setChoices(event.currentTarget.value)}
          />
        </>
      ) : null}
      {kind === 'ref' ? (
        <>
          <label for={`${id}-to`}>Names records of</label>
          <select
            id={`${id}-to`}
            class="field form-select"
            value={target}
            onChange={(event) => setTarget(event.currentTarget.value)}
          >
            {design.types.map((type) => (
              <option key={type} value={type}>
                {design.titleOf(type)}
              </option>
            ))}
          </select>
        </>
      ) : null}
      <div class="form-bool">
        <input
          id={`${id}-optional`}
          type="checkbox"
          class="form-check"
          checked={optional}
          onChange={(event) => setOptional(event.currentTarget.checked)}
        />
        <label for={`${id}-optional`} class="form-label">
          Optional: records may leave it out
        </label>
      </div>
      {fills && !needsChoices ? (
        <div class="fill-missing">
          <p>{holders === 1 ? 'The record there is gets:' : `The ${records(holders)} there are get:`}</p>
          <LocalField
            key={shape}
            catalog={design.project.catalog}
            names={namesOf(design.project.index, design.project.catalog)}
            label={`${humanize(typed || 'value')} for the records there are`}
            def={def as ValueDef}
            value={value}
            change={(next) => setFill({ key: shape, value: next(value) })}
          />
        </div>
      ) : null}
      <div class="form-actions">
        <button type="submit" class="button primary" disabled={!ready}>
          Add field
        </button>
        <button type="button" class="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
