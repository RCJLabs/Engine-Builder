/**
 * The record form's FormApi over a part of a screen file (M4.5): the screen itself, a widget or a
 * tab, so the record form's own field components edit it. Each write sets the value at the part's
 * path as it is in the file then, each new key in the file's order, and drops an `at` left empty.
 */
import type { Diagnostic, TypeFile } from '@eb/schema';
import type { FormApi } from '../forms/formContext.ts';
import { pointerOf } from '../forms/formContext.ts';
import { getIn, type Path } from '../forms/values.ts';
import type { OpenProject } from '../projects/opened.ts';
import { pathOf, pruneAt, setAt } from './paths.ts';
import { editFile } from './state.ts';

export interface Part {
  readonly project: OpenProject;
  readonly file: string;
  /** The part's JSON Pointer in the file: '' for the screen. */
  readonly at: string;
  readonly typeFile: TypeFile;
  readonly problems: readonly Diagnostic[];
  readonly canEdit: boolean;
  /** What the undo list calls the file: "hut". */
  readonly title: string;
}

/** The file after `make` changes the value at `path` under the part, wherever the part now sits. */
export function changeUnder(at: string, path: Path, make: (now: unknown) => unknown) {
  return (root: unknown): unknown => {
    const part = pathOf(root, at);
    const full = [...part, ...path];
    return pruneAt(setAt(root, full, make(getIn(root, full))), part);
  };
}

export function formApi(part: Part): FormApi {
  const { project, file, at, typeFile, problems, canEdit, title } = part;
  return {
    canEdit,
    catalog: project.catalog,
    typeFile,
    id: file,
    problemsAt: (pointer) => problems.filter((p) => p.path === `${at}${pointer}`),
    set: (path, next, label) =>
      editFile(
        file,
        `Edit ${label} in ${title}`,
        changeUnder(at, path, () => next),
        `${file}#${at}${pointerOf(path)}`,
      ),
    update: (path, change, said) => editFile(file, `${said} in ${title}`, changeUnder(at, path, change)),
  };
}
