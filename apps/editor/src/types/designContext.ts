/**
 * What every part of the type designer (M2.6) reaches through context: the type file as it is
 * now, whether this tab may change it, its problems, its records, and the one way it changes,
 * a step undo takes back. Also the form the record form's own fields write through, for the
 * designer's titles, labels and bounds.
 */
import type { Diagnostic, TypeFile } from '@eb/schema';
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { type FormApi, pointerOf } from '../forms/formContext.ts';
import type { Path } from '../forms/values.ts';
import type { OpenProject } from '../projects/opened.ts';

import { nodeAt, setInTypeFile } from './defPaths.ts';
import { type FieldChange, setChange } from './fieldEdits.ts';

/** What holds values of the type: a record, or an object's component of a kind (M5.2), with its problems. */
export interface Holder {
  readonly value: unknown;
  readonly problems: readonly Diagnostic[];
}

export interface Design {
  readonly project: OpenProject;
  readonly type: string;
  /** The type file's path: types/<type>.json. */
  readonly file: string;
  /** Its JSON as it is now, problems and all. */
  readonly json: unknown;
  /** The type's title, or its name when it has none. */
  readonly title: string;
  /**
   * A kit's type (M3.3, D41): the kit, and its type file, whose fields come first and stay as they
   * are. The file the designer edits then holds only the project's own fields.
   */
  readonly kit?: { readonly id: string; readonly file: TypeFile };
  readonly canEdit: boolean;
  /** The type file's problems at a pointer the designer shows. */
  problemsAt(pointer: string): readonly Diagnostic[];
  /** The pointers that have problems, for a shut row to say it holds some. */
  readonly troubled: readonly string[];
  /**
   * The type's records as the index read them, none until it has; for a component kind (M5.2), the
   * objects' own components of it in spaces and prefabs.
   */
  readonly records: readonly Holder[];
  /** Every type file's type, for refs to name, sound or not. */
  readonly types: readonly string[];
  /** A type's title, or its name. */
  titleOf(type: string): string;
  /**
   * Makes `change` one step, with its records rewritten to match. A change that would lose
   * data changes nothing and says why. Resolves to whether it was made.
   */
  change(label: string, change: FieldChange, group?: string): Promise<boolean>;
}

export const DesignContext = createContext<Design | null>(null);

export function useDesign(): Design {
  const design = useContext(DesignContext);
  if (!design) throw new Error('A part of the type designer must sit inside it');
  return design;
}

// The form's fields read nothing from it: the designer's own fields are text, numbers and choices.
const NO_TYPE: TypeFile = { title: '', fields: {} };

/**
 * A form over the object at `at` in the type file (the file itself, or a def), for the record
 * form's fields. `what` names it in the steps it makes: "Edit Label of might in type gladiator".
 * A box ticked off takes its key out: `optional` and `multiline` mean nothing when false.
 */
export function designForm(design: Design, at: Path, what: string): FormApi {
  return {
    canEdit: design.canEdit,
    catalog: design.project.catalog,
    typeFile: NO_TYPE,
    id: design.type,
    problemsAt: (pointer) => design.problemsAt(`${pointerOf(at)}${pointer}`),
    set: (path, next, label) =>
      void design.change(
        `Edit ${label} of ${what}`,
        setChange([...at, ...path], next === false ? undefined : next),
        `${design.file}#${pointerOf([...at, ...path])}`,
      ),
    update: (path, make, said) =>
      void design.change(`${said} in ${what}`, (file) => ({
        file: setInTypeFile(file, [...at, ...path], make(nodeAt(file, [...at, ...path]))),
      })),
  };
}
