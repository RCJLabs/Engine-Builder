import type { DataType, Diagnostic } from '@eb/schema';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import type { Catalog } from '../forms/catalog.ts';
import { FieldView } from '../forms/FieldView.tsx';
import { type FormApi, FormContext } from '../forms/formContext.ts';
import { labelOf } from '../forms/labels.ts';
import { checkRecord, fieldPointers, routeProblems } from '../forms/problems.ts';
import { emptyValue, getIn, setIn } from '../forms/values.ts';
import type { NameOf } from './cells.ts';
import type { IndexedRecord } from './recordIndex.ts';
import { fieldValue } from './table.ts';

const same = (values: readonly unknown[]) => values.every((v) => JSON.stringify(v) === JSON.stringify(values[0]));
const records = (count: number) => (count === 1 ? '1 record' : `${count} records`);

/**
 * One field set on every record selected (M2.5): chosen from the type's fields, filled in with the
 * control the record form has for it, and written to them all as one step. It starts at the value
 * they share, if they do. Its problems are those the first record would have with it.
 */
export function BulkEdit(props: {
  data: DataType;
  catalog: Catalog;
  names: NameOf;
  selected: readonly IndexedRecord[];
  apply: (field: string, label: string, value: unknown) => void;
  close: () => void;
}) {
  const { data, selected, close } = props;
  const fields = Object.entries(data.file.fields);
  const [field, setField] = useState(fields[0]?.[0] ?? '');
  const choose = useUniqueId();
  const box = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => box.current?.focus(), []);
  const def = data.file.fields[field];
  return (
    <section class="bulk-edit" aria-labelledby={`${choose}-title`}>
      <h3 id={`${choose}-title`}>Edit a field on {records(selected.length)}</h3>
      <label for={choose}>Field</label>
      <select
        ref={box}
        id={choose}
        class="field"
        value={field}
        onChange={(event) => setField(event.currentTarget.value)}
      >
        {fields.map(([name, each]) => (
          <option key={name} value={name}>
            {labelOf(name, each)}
          </option>
        ))}
      </select>
      {def ? (
        // Keyed by the field, so the value starts again for each one chosen.
        <BulkValue key={field} {...props} field={field} />
      ) : (
        <div class="form-actions">
          <button type="button" class="button" onClick={close}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}

function BulkValue(props: {
  data: DataType;
  catalog: Catalog;
  names: NameOf;
  selected: readonly IndexedRecord[];
  field: string;
  apply: (field: string, label: string, value: unknown) => void;
  close: () => void;
}) {
  const { data, catalog, names, selected, field, apply, close } = props;
  const file = data.file;
  const def = file.fields[field] as NonNullable<(typeof file.fields)[string]>;
  const label = labelOf(field, def);
  const held = selected.map((record) => fieldValue(record, field));
  const shared = same(held);
  const [value, setValue] = useState<unknown>(() => (shared && held[0] !== undefined ? held[0] : emptyValue(def)));
  const first = selected[0];
  // The problems the first record would have with this value: the same checks as its form.
  const routed = useMemo(() => {
    if (!first || typeof first.value !== 'object' || first.value === null) return new Map<string, Diagnostic[]>();
    const sample = setIn(first.value, [field], value, file);
    return routeProblems(checkRecord(catalog, data.type, first.id, sample), fieldPointers(file, sample));
  }, [first, field, value, file, catalog, data.type]);
  const change = (path: readonly (string | number)[], next: (now: unknown) => unknown) =>
    setValue((now: unknown) =>
      getIn(setIn({ [field]: now }, path, next(getIn({ [field]: now }, path)), file), [field]),
    );
  const api: FormApi = {
    canEdit: true,
    ownUndo: true,
    catalog,
    names,
    typeFile: file,
    id: first?.id ?? '',
    problemsAt: (pointer) => routed.get(pointer) ?? [],
    set: (path, next) => change(path, () => next),
    update: (path, make) => change(path, make),
  };
  return (
    <FormContext.Provider value={api}>
      {!shared ? <p class="form-help">These records hold different values for {label} now.</p> : null}
      <FieldView label={label} def={def} info={def} path={[field]} value={value} />
      <div class="form-actions">
        <button
          type="button"
          class="button primary"
          disabled={value === undefined}
          onClick={() => apply(field, label, value)}
        >
          Set on {records(selected.length)}
        </button>
        {def.optional ? (
          <button type="button" class="button" onClick={() => apply(field, label, undefined)}>
            Clear on {records(selected.length)}
          </button>
        ) : null}
        <button type="button" class="button" onClick={close}>
          Cancel
        </button>
      </div>
    </FormContext.Provider>
  );
}
