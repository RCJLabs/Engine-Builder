/**
 * What every field of a record form reaches through context: whether it may edit, the project's
 * catalog, the record's problems, and the two ways a field writes. Also the field state shared by
 * every kind: when to show a problem. What is typed but not yet written is editing/draft.ts.
 */
import { pointerSegment } from '@eb/core';
import type { Diagnostic, TypeFile } from '@eb/schema';
import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';
import type { Catalog } from './catalog.ts';
import type { Problem } from './FieldShell.tsx';
import type { Path } from './values.ts';

export interface FormApi {
  readonly canEdit: boolean;
  readonly catalog: Catalog;
  readonly typeFile: TypeFile;
  readonly id: string;
  problemsAt(pointer: string): readonly Diagnostic[];
  /** Sets the value at `path`, or removes it (undefined), as a step; typing in one field joins into one. */
  set(path: Path, next: unknown, label: string): void;
  /** Replaces the value at `path` by what `change` makes of it, as a step of its own: adding, removing, moving. */
  update(path: Path, change: (current: unknown) => unknown, said: string): void;
}

export const FormContext = createContext<FormApi | null>(null);

export function useForm(): FormApi {
  const api = useContext(FormContext);
  if (!api) throw new Error('A field must sit inside a record form');
  return api;
}

export const pointerOf = (path: Path): string => path.map((key) => `/${pointerSegment(key)}`).join('');

/**
 * The problems a field shows. One that appears while the field is being typed in waits until it
 * is left; one it had already stays up while it is fixed, and goes as soon as it is.
 */
export function useShownProblems(problems: readonly Problem[]) {
  const [quiet, setQuiet] = useState(false);
  return {
    shown: quiet ? [] : problems,
    onFocus: () => setQuiet(problems.length === 0),
    onBlur: () => setQuiet(false),
  };
}
