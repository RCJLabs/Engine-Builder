/** The fields picked rather than typed: one of a list, yes or no, and a colour. */
import { COLOUR_PATTERN, type ValueDef } from '@eb/schema';
import { useUniqueId } from '../../app/ids.ts';
import { asWritten, describedBy, FieldLabel, FieldNotes, type FieldProps, FieldShell } from '../FieldShell.tsx';
import { pointerOf, useForm, useShownProblems } from '../formContext.ts';

type EnumDef = Extract<ValueDef, { kind: 'enum' }>;

/**
 * One of the type's values, from the platform's own picker, which a phone shows full size. A value
 * the file holds that isn't one of them stays on the list, marked, so the field shows the file.
 */
export function EnumField({ label, def, info, path, value, quietLabel }: FieldProps<EnumDef>) {
  const form = useForm();
  const id = useUniqueId();
  const { shown, onFocus, onBlur } = useShownProblems(form.problemsAt(pointerOf(path)));
  const held = typeof value === 'string' ? value : asWritten(value);
  const stray = value !== undefined && !def.values.includes(held);
  return (
    <FieldShell id={id} label={label} info={info} shown={shown} quiet={quietLabel}>
      <select
        id={id}
        class="field form-select"
        value={value === undefined ? '' : held}
        disabled={!form.canEdit}
        aria-invalid={shown.length > 0 ? 'true' : undefined}
        aria-describedby={describedBy(id, info, shown)}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(event) => {
          const picked = event.currentTarget.value;
          form.set(path, picked === '' ? undefined : picked, label);
        }}
      >
        {value === undefined || info.optional ? <option value="">{info.optional ? 'None' : 'Choose…'}</option> : null}
        {stray ? <option value={held}>{held} (not one of the choices)</option> : null}
        {def.values.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

/** Yes or no: a box to tick, its label beside it, the whole row the target a thumb taps. */
export function BoolField({ label, info, path, value, quietLabel }: FieldProps) {
  const form = useForm();
  const id = useUniqueId();
  const { shown, onFocus, onBlur } = useShownProblems(form.problemsAt(pointerOf(path)));
  const clear =
    info.optional && value !== undefined && form.canEdit ? () => form.set(path, undefined, label) : undefined;
  return (
    <div class="form-field">
      <div class="form-bool">
        <input
          id={id}
          type="checkbox"
          class="form-check"
          checked={value === true}
          disabled={!form.canEdit}
          aria-invalid={shown.length > 0 ? 'true' : undefined}
          aria-describedby={describedBy(id, info, shown)}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(event) => form.set(path, event.currentTarget.checked, label)}
        />
        <FieldLabel id={id} label={label} info={info} quiet={quietLabel} clear={clear} />
      </div>
      <FieldNotes id={id} info={info} shown={shown} />
    </div>
  );
}

/** A colour from the platform's colour picker, written as the web writes it: "#" and six hex digits. */
export function ColourField({ label, info, path, value, quietLabel }: FieldProps) {
  const form = useForm();
  const id = useUniqueId();
  const { shown, onFocus, onBlur } = useShownProblems(form.problemsAt(pointerOf(path)));
  const held = typeof value === 'string' ? value : asWritten(value);
  const sound = COLOUR_PATTERN.test(held);
  const clear =
    info.optional && value !== undefined && form.canEdit ? () => form.set(path, undefined, label) : undefined;
  return (
    <FieldShell id={id} label={label} info={info} shown={shown} quiet={quietLabel} clear={clear}>
      <div class="form-colour">
        <input
          id={id}
          type="color"
          class="form-swatch"
          // The picker shows black for no colour; the words beside it say there is none.
          value={sound ? held.toLowerCase() : '#000000'}
          disabled={!form.canEdit}
          aria-describedby={describedBy(id, info, shown)}
          onFocus={onFocus}
          onBlur={onBlur}
          onInput={(event) => form.set(path, event.currentTarget.value, label)}
        />
        <span class="mono">{value === undefined ? 'No colour' : held}</span>
      </div>
    </FieldShell>
  );
}
