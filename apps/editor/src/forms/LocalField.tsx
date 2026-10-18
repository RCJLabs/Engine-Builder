import { type Diagnostic, type FieldDef, type TypeFile, typeFromFile, type ValueDef } from '@eb/schema';
import { useMemo } from 'preact/hooks';
import type { Catalog } from './catalog.ts';
import { FieldView } from './FieldView.tsx';
import { type FormApi, FormContext } from './formContext.ts';
import { checkRecord, fieldPointers, routeProblems } from './problems.ts';
import { getIn, setIn } from './values.ts';

const KEY = 'value';

/** A type name the project doesn't use, for the type made to check the value. */
function freeType(catalog: Catalog): string {
  for (let n = 1; ; n++) if (!catalog.names.includes(`value-${n}`)) return `value-${n}`;
}

/**
 * The problems a value would have in a field of `def`, as the compiler would give them: the
 * value checked as the one field of a type made for it, beside the project's own types.
 */
function useProblems(catalog: Catalog, file: TypeFile, value: unknown): Map<string, Diagnostic[]> {
  return useMemo(() => {
    try {
      const type = freeType(catalog);
      const { recordType } = typeFromFile(type, file);
      const record = { [KEY]: value };
      const diagnostics = checkRecord(
        { ...catalog, recordTypes: [...catalog.recordTypes, recordType] },
        type,
        'value',
        record,
      );
      return routeProblems(diagnostics, fieldPointers(file, record));
    } catch {
      // A def the format can't build yet (a choice with no choices) has no problems to show here.
      return new Map();
    }
  }, [catalog, file, value]);
}

/**
 * A value of `def` that lives in no file yet, with the record form's control for it: what a new
 * field fills its records with (M2.6). Its boxes keep the browser's own undo while typing, since
 * the editor's would undo a step the form never made (FormApi.ownUndo).
 */
export function LocalField(props: {
  catalog: Catalog;
  names?: (key: string) => string | undefined;
  label: string;
  def: ValueDef;
  value: unknown;
  change: (next: (now: unknown) => unknown) => void;
}) {
  const { catalog, names, label, def, value, change } = props;
  const file: TypeFile = useMemo(() => ({ title: label, fields: { [KEY]: def as FieldDef } }), [label, def]);
  const routed = useProblems(catalog, file, value);
  const write = (path: readonly (string | number)[], make: (now: unknown) => unknown) =>
    change((now) => getIn(setIn({ [KEY]: now }, path, make(getIn({ [KEY]: now }, path)), file), [KEY]));
  const api: FormApi = {
    canEdit: true,
    ownUndo: true,
    catalog,
    ...(names ? { names } : {}),
    typeFile: file,
    id: '',
    problemsAt: (pointer) => routed.get(pointer) ?? [],
    set: (path, next) => write(path, () => next),
    update: (path, make) => write(path, make),
  };
  return (
    <FormContext.Provider value={api}>
      <FieldView label={label} def={def} info={{}} path={[KEY]} value={value} />
    </FormContext.Provider>
  );
}
