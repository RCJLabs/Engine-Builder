/** Fields filled by choosing from the project: a record of a type (ref), or a file under assets/ (asset). */
import { isAssetOf, type ValueDef } from '@eb/schema';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../../app/ids.ts';
import { openRecord } from '../../records/actions.ts';
import { asWritten, describedBy, type FieldProps, FieldShell } from '../FieldShell.tsx';
import { pointerOf, useForm, useShownProblems } from '../formContext.ts';
import { type Choice, Picker } from '../Picker.tsx';
import { noNames, refChoices } from '../refChoices.ts';

type RefDef = Extract<ValueDef, { kind: 'ref' }>;
type AssetDef = Extract<ValueDef, { kind: 'asset' }>;

/** The record a ref field's value names, when it is there to open. */
function target(def: RefDef, value: unknown, records: ReadonlyMap<string, readonly string[]>) {
  if (typeof value !== 'string' || value === '') return null;
  const [type, id] = typeof def.to === 'string' ? [def.to, value] : value.split(':', 2);
  return type && id && records.get(type)?.includes(id) ? { type, id } : null;
}

export function RefField(props: FieldProps<RefDef>) {
  const { catalog, names = noNames } = useForm();
  const noun = typeof props.def.to === 'string' ? props.def.to : 'record';
  const types = typeof props.def.to === 'string' ? props.def.to : props.def.to.join(' or ');
  const named = target(props.def, props.value, catalog.records);
  return (
    <PickField
      {...props}
      choices={refChoices(props.def, catalog.records, names)}
      title={`Choose a ${noun}`}
      empty={`There are no ${types} records yet.`}
      shownName={named ? names(`${named.type}:${named.id}`) : undefined}
      open={named ? () => openRecord(named.type, named.id) : undefined}
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
 * value together, so a screen reader says both. A ref to a record that is there can be opened.
 */
function PickField(
  props: FieldProps & {
    choices: readonly Choice[];
    title: string;
    empty: string;
    /** The name of the record the value names, shown before its id. */
    shownName?: string | undefined;
    open?: (() => void) | undefined;
  },
) {
  const { label, info, path, value, quietLabel, choices, title, empty, shownName, open: openIt } = props;
  const form = useForm();
  const id = useUniqueId();
  const [open, setOpen] = useState(false);
  const { shown, onFocus, onBlur } = useShownProblems(form.problemsAt(pointerOf(path)));
  const held = typeof value === 'string' ? value : asWritten(value);
  const clear =
    info.optional && value !== undefined && form.canEdit ? () => form.set(path, undefined, label) : undefined;
  return (
    <FieldShell id={id} label={label} info={info} shown={shown} quiet={quietLabel} clear={clear}>
      <div class="form-pick-row">
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
          <span id={`${id}-value`} class={held === '' ? 'muted' : shownName ? undefined : 'mono'}>
            {held === '' ? (
              'Not chosen'
            ) : shownName ? (
              <>
                {shownName} <span class="mono muted">{held}</span>
              </>
            ) : (
              held
            )}
          </span>
        </button>
        {openIt ? (
          <button type="button" class="button form-open" aria-label={`Open ${held}`} onClick={openIt}>
            Open
          </button>
        ) : null}
      </div>
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
