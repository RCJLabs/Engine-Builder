/**
 * A part's fields as the record form draws a record's (M5.2, D64): an object's component, a
 * component an override changes, or a placed record's fields here. A field this placement
 * overrides says so, with Revert, which takes the override out so the prefab's or the record's
 * value shows again.
 */
import type { DataType } from '@eb/schema';
import { useUniqueId } from '../app/ids.ts';
import { FieldView } from '../forms/FieldView.tsx';
import { FormContext } from '../forms/formContext.ts';
import { labelOf } from '../forms/labels.ts';
import { getIn } from '../forms/values.ts';
import { type PartForm, partForm } from './partForm.ts';

export function PartFields(props: {
  form: PartForm;
  /** Whether this placement overrides a field: those get Revert. */
  overridden?: (field: string) => boolean;
  revert?: (field: string) => void;
}) {
  const { form, overridden, revert } = props;
  const fields = Object.entries(form.typeFile.fields);
  if (fields.length === 0) return <p class="muted">It has no fields.</p>;
  return (
    <FormContext.Provider value={partForm(form)}>
      {fields.map(([name, def]) => {
        const label = labelOf(name, def);
        return (
          <div key={name} class="part-field">
            <FieldView label={label} def={def} info={def} path={[name]} value={getIn(form.value, [name])} />
            {overridden?.(name) ? (
              <p class="part-mark">
                <span>Changed here</span>
                {form.canEdit && revert ? (
                  <button type="button" class="button" aria-label={`Revert ${label}`} onClick={() => revert(name)}>
                    Revert
                  </button>
                ) : null}
              </p>
            ) : null}
          </div>
        );
      })}
    </FormContext.Provider>
  );
}

/** A box choosing a kind the object hasn't got yet: choosing one adds it. */
export function AddComponent(props: {
  kinds: ReadonlyMap<string, DataType>;
  has: readonly string[];
  add: (kind: string, type: DataType) => void;
}) {
  const id = useUniqueId();
  const offered = [...props.kinds].filter(([kind]) => !props.has.includes(kind));
  if (offered.length === 0) return null;
  return (
    <div class="form-field">
      <label for={id} class="form-label">
        Add a component
      </label>
      <select
        id={id}
        class="field"
        value=""
        onChange={(event) => {
          const kind = event.currentTarget.value;
          const type = props.kinds.get(kind);
          event.currentTarget.value = '';
          if (type) props.add(kind, type);
        }}
      >
        <option value="">Choose a kind…</option>
        {offered.map(([kind, type]) => (
          <option key={kind} value={kind}>
            {type.file.title}
          </option>
        ))}
      </select>
    </div>
  );
}
