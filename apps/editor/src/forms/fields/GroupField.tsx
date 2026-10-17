import type { ValueDef } from '@eb/schema';
import { useUniqueId } from '../../app/ids.ts';
import { FieldNotes, type FieldProps, Legend, WrongShape } from '../FieldShell.tsx';
import { FieldView } from '../FieldView.tsx';
import { pointerOf, useForm } from '../formContext.ts';
import { labelOf } from '../labels.ts';
import { newGroup } from '../values.ts';

type GroupDef = Extract<ValueDef, { kind: 'group' }>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A group of fields inside a record. One the record leaves out is added whole, with its required
 * fields, rather than one field at a time, which would leave its others missing.
 */
export function GroupField({ label, def, info, path, value }: FieldProps<GroupDef>) {
  const form = useForm();
  const id = useUniqueId();
  const problems = form.problemsAt(pointerOf(path));
  const clear = info.optional && value !== undefined && form.canEdit;
  return (
    <fieldset class="form-group" aria-describedby={problems.length > 0 ? `${id}-problems` : undefined}>
      <Legend label={label} info={info} />
      {value === undefined ? (
        <div class="form-actions">
          <button
            type="button"
            class="button"
            disabled={!form.canEdit}
            onClick={() => form.update(path, () => newGroup(def.fields), `Add ${label}`)}
          >
            Add {label}
          </button>
        </div>
      ) : isObject(value) ? (
        Object.entries(def.fields).map(([name, field]) => (
          <FieldView
            key={name}
            label={labelOf(name, field)}
            def={field}
            info={field}
            path={[...path, name]}
            value={value[name]}
          />
        ))
      ) : (
        <WrongShape
          value={value}
          what="group"
          canEdit={form.canEdit}
          replace={() => form.set(path, newGroup(def.fields), label)}
        />
      )}
      {clear ? (
        <div class="form-actions">
          <button type="button" class="button" onClick={() => form.set(path, undefined, label)}>
            Clear {label}
          </button>
        </div>
      ) : null}
      <FieldNotes id={id} info={info} shown={problems} />
    </fieldset>
  );
}
