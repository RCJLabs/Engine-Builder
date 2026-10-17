import type { FieldInfo, ValueDef } from '@eb/schema';
import type { ComponentChildren } from 'preact';
import type { Path } from './values.ts';

/** What every field component is given: where the value sits, what it is, and what it holds now. */
export interface FieldProps<D extends ValueDef = ValueDef> {
  /** The field's label, or a list item's ("Skills, item 2"). */
  readonly label: string;
  readonly def: D;
  /** optional, label and description; empty for a list's items and a map's values. */
  readonly info: FieldInfo;
  readonly path: Path;
  /** Undefined when the record leaves the field out. */
  readonly value: unknown;
  /** A list item's label is for screen readers; the list says what its items are. */
  readonly quietLabel?: boolean;
}

/** What a field says is wrong: a diagnostic, or the form's own word on input that isn't a value yet. */
export interface Problem {
  readonly message: string;
}

/** The ids of what describes a field's input: its help, then its problems. */
export const describedBy = (id: string, info: FieldInfo, shown: readonly Problem[]): string | undefined =>
  [info.description ? `${id}-help` : '', shown.length > 0 ? `${id}-problems` : ''].filter(Boolean).join(' ') ||
  undefined;

export function FieldNotes({ id, info, shown }: { id: string; info: FieldInfo; shown: readonly Problem[] }) {
  return (
    <>
      {info.description ? (
        <p id={`${id}-help`} class="form-help">
          {info.description}
        </p>
      ) : null}
      {shown.length > 0 ? (
        <div id={`${id}-problems`} class="form-problems">
          {shown.map((problem) => (
            <p key={problem.message} class="field-problem">
              {problem.message}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function FieldLabel(props: {
  id: string;
  label: string;
  info: FieldInfo;
  quiet?: boolean | undefined;
  clear?: (() => void) | undefined;
}) {
  const { id, label, info, quiet, clear } = props;
  return (
    <div class="form-label-row">
      <label id={`${id}-label`} for={id} class={quiet ? 'visually-hidden' : 'form-label'}>
        {label}
        {info.optional && !quiet ? <span class="form-optional"> (optional)</span> : null}
      </label>
      {clear ? (
        <button type="button" class="button form-clear" onClick={clear} aria-label={`Clear ${label}`}>
          Clear
        </button>
      ) : null}
    </div>
  );
}

/** A field with one input: its label above, its help and problems below. */
export function FieldShell(props: {
  id: string;
  label: string;
  info: FieldInfo;
  shown: readonly Problem[];
  quiet?: boolean | undefined;
  clear?: (() => void) | undefined;
  children: ComponentChildren;
}) {
  const { id, label, info, shown, quiet, clear, children } = props;
  return (
    <div class="form-field">
      <FieldLabel id={id} label={label} info={info} quiet={quiet} clear={clear} />
      {children}
      <FieldNotes id={id} info={info} shown={shown} />
    </div>
  );
}

/** What a field shows its value as when the value isn't the kind it should be: the JSON as written. */
export const asWritten = (value: unknown): string => (value === undefined ? '' : JSON.stringify(value));

/**
 * A list, map or group whose value is of another shape in the file: the JSON as written, and a
 * way to start again. Nothing is replaced until it is asked for.
 */
export function WrongShape(props: { value: unknown; what: string; canEdit: boolean; replace: () => void }) {
  return (
    <div class="form-actions">
      <p class="mono form-wrong">{asWritten(props.value)}</p>
      <button type="button" class="button" disabled={!props.canEdit} onClick={props.replace}>
        Replace with an empty {props.what}
      </button>
    </div>
  );
}

/** A fieldset's legend: a list's, a map's or a group's label, marked when optional. */
export function Legend({ label, info }: { label: string; info: FieldInfo }) {
  return (
    <legend class="form-legend">
      {label}
      {info.optional ? <span class="form-optional"> (optional)</span> : null}
    </legend>
  );
}
