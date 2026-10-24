/**
 * The record form's FormApi over a part of the open space or prefab (M5.2, D64), so the form's own
 * field components edit it: an object's own component, a component an override changes, or a
 * placed record's fields. The object is found by its id when the step runs, never by its place in
 * the list. An override holds a field whole: typing inside one writes all of it, the rest as shown.
 */
import type { Diagnostic, TypeFile } from '@eb/schema';
import type { Catalog } from '../forms/catalog.ts';
import { type FormApi, pointerOf as pointer } from '../forms/formContext.ts';
import { getIn, type Path, setIn } from '../forms/values.ts';
import type { NameOf } from '../records/cells.ts';
import { editOpen } from './actions.ts';
import { overrideAt, setComponent, setOverride } from './partEdits.ts';

/** Where a part sits: the object's id, and under it an override of the object `inside` names, or its own. */
export type Part =
  | { readonly kind: 'component'; readonly object: string; readonly component: string }
  | { readonly kind: 'override'; readonly object: string; readonly inside: readonly string[]; readonly under: Path };

export interface PartForm {
  readonly part: Part;
  readonly file: string;
  /** The object's place in the file now, for the problems' pointers. */
  readonly index: number;
  readonly typeFile: TypeFile;
  /** The part as the view shows it: the record's or the prefab's, with what is overridden laid over. */
  readonly value: unknown;
  readonly canEdit: boolean;
  readonly catalog: Catalog;
  readonly names: NameOf;
  readonly problems: readonly Diagnostic[];
  /** What the undo list calls it: "light of lamp". */
  readonly title: string;
}

/** The part's JSON Pointer in the file: what its problems are reported under. */
export function partPointer(part: Part, index: number): string {
  const object = `/objects/${index}`;
  return part.kind === 'component'
    ? `${object}/components/${pointer([part.component])}`
    : `${object}${pointer([...overrideAt(part.inside), ...part.under])}`;
}

/** The value the part becomes once `next` is at `path` in it: the whole field, for an override. */
function written(form: PartForm, path: Path, next: unknown) {
  const [field, ...rest] = path as [string, ...(string | number)[]];
  const whole = setIn(getIn(form.value, [field]), rest, next, nestedFile(form.typeFile, field));
  return { field, whole };
}

/** A field's own fields as a type file, so a key added inside it goes where the type lists it. */
const nestedFile = (file: TypeFile, field: string): TypeFile => {
  const def = file.fields[field];
  return def?.kind === 'group' ? { title: file.title, fields: def.fields } : { title: file.title, fields: {} };
};

function write(form: PartForm, path: Path, next: unknown, label: string, group?: string): void {
  const { part } = form;
  if (part.kind === 'component') {
    void editOpen(label, (space) => setComponent(space, part.object, part.component, path, next, form.typeFile), group);
    return;
  }
  if (path.length === 0) return;
  const { field, whole } = written(form, path, next);
  void editOpen(label, (space) => setOverride(space, part.object, part.inside, [...part.under, field], whole), group);
}

export function partForm(form: PartForm): FormApi {
  const at = partPointer(form.part, form.index);
  return {
    canEdit: form.canEdit,
    catalog: form.catalog,
    names: form.names,
    typeFile: form.typeFile,
    id: `${form.file}#${at}`,
    problemsAt: (p) => form.problems.filter((d) => d.file === form.file && d.path === `${at}${p}`),
    set: (path, next, label) =>
      write(form, path, next, `Edit ${label} of ${form.title}`, `${form.file}#${at}${pointer(path)}`),
    update: (path, change, said) => write(form, path, change(getIn(form.value, path)), `${said} in ${form.title}`),
  };
}
