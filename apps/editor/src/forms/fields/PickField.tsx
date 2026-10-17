/** Fields filled by choosing from the project: a record of a type (ref), or a file under assets/ (asset). */
import { isAssetOf, type ValueDef } from '@eb/schema';
import { useId, useState } from 'preact/hooks';
import { asWritten, describedBy, type FieldProps, FieldShell } from '../FieldShell.tsx';
import { pointerOf, useForm, useShownProblems } from '../formContext.ts';
import { type Choice, Picker } from '../Picker.tsx';

type RefDef = Extract<ValueDef, { kind: 'ref' }>;
type AssetDef = Extract<ValueDef, { kind: 'asset' }>;

/** The records a ref field can name: bare ids for one type, "type:id" for several. */
export function refChoices(def: RefDef, records: ReadonlyMap<string, readonly string[]>): Choice[] {
  if (typeof def.to === 'string') return (records.get(def.to) ?? []).map((id) => ({ value: id, label: id }));
  return def.to.flatMap((type) =>
    (records.get(type) ?? []).map((id) => ({ value: `${type}:${id}`, label: `${id} (${type})`, keywords: type })),
  );
}

export function RefField(props: FieldProps<RefDef>) {
  const { catalog } = useForm();
  const noun = typeof props.def.to === 'string' ? props.def.to : 'record';
  const types = typeof props.def.to === 'string' ? props.def.to : props.def.to.join(' or ');
  return (
    <PickField
      {...props}
      choices={refChoices(props.def, catalog.records)}
      title={`Choose a ${noun}`}
      empty={`There are no ${types} records yet.`}
    />
  );
}

export function AssetField(props: FieldProps<AssetDef>) {
  const { catalog } = useForm();
  const kind = props.def.of ?? true;
  const noun = props.def.of === undefined ? 'file' : props.def.of === 'audio' ? 'audio file' : props.def.of;
  const choices = catalog.assets.filter((path) => isAssetOf(path, kind)).map((path) => ({ value: path, label: path }));
  return (
    <PickField
      {...props}
      choices={choices}
      title={`Choose ${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`}
      empty={`There is no ${noun} in assets/ yet. Importing assets comes with M2.7.`}
    />
  );
}

/**
 * A button that shows what the field holds and opens the picker. Its name is the label and the
 * value together, so a screen reader says both.
 */
function PickField(props: FieldProps & { choices: readonly Choice[]; title: string; empty: string }) {
  const { label, info, path, value, quietLabel, choices, title, empty } = props;
  const form = useForm();
  const id = useId();
  const [open, setOpen] = useState(false);
  const { shown, onFocus, onBlur } = useShownProblems(form.problemsAt(pointerOf(path)));
  const held = typeof value === 'string' ? value : asWritten(value);
  const clear =
    info.optional && value !== undefined && form.canEdit ? () => form.set(path, undefined, label) : undefined;
  return (
    <FieldShell id={id} label={label} info={info} shown={shown} quiet={quietLabel} clear={clear}>
      <button
        id={id}
        type="button"
        class="field form-pick"
        disabled={!form.canEdit}
        aria-haspopup="dialog"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-invalid={shown.length > 0 ? 'true' : undefined}
        aria-describedby={describedBy(id, info, shown)}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={() => setOpen(true)}
      >
        <span id={`${id}-value`} class={held === '' ? 'muted' : 'mono'}>
          {held === '' ? 'Not chosen' : held}
        </span>
      </button>
      {open ? (
        <Picker
          title={title}
          choices={choices}
          current={held}
          empty={empty}
          choose={(picked) => form.set(path, picked, label)}
          close={() => setOpen(false)}
        />
      ) : null}
    </FieldShell>
  );
}
