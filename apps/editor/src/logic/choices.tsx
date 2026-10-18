/**
 * The choices the sheet editor offers (M3.1): a flag, and a value for an event's argument. Each is
 * the platform's own select or box, which a phone shows full size, with its label, help and the
 * problems validation gives at its place in the record.
 */
import { FLAG, type FlagRecord, formatRef } from '@eb/core';
import type { FieldInfo } from '@eb/schema';
import { useUniqueId } from '../app/ids.ts';
import { describedBy, FieldShell } from '../forms/FieldShell.tsx';
import { pointerOf, useForm, useShownProblems } from '../forms/formContext.ts';
import type { Path } from '../forms/values.ts';
import { current } from '../projects/opened.ts';

/** A flag's record as the index read it, when it is there to read. */
export function flagOf(id: unknown): FlagRecord | undefined {
  const record = typeof id === 'string' ? current.value?.index?.records.get(formatRef(FLAG, id)) : undefined;
  const value = record?.value;
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as FlagRecord) : undefined;
}

/** "Met the trader (met-trader)", or the id alone when the flag has no name. */
function flagLabel(id: string, names: ((key: string) => string | undefined) | undefined): string {
  const name = names?.(formatRef(FLAG, id));
  return name ? `${name} (${id})` : id;
}

/** One of the project's flags, by id. A value that names no flag stays on the list, marked, so the field shows the file. */
export function FlagSelect(props: { path: Path; value: unknown; label: string; info?: FieldInfo }) {
  const { path, value, label, info = {} } = props;
  const form = useForm();
  const id = useUniqueId();
  const { shown, onFocus, onBlur } = useShownProblems(form.problemsAt(pointerOf(path)));
  const flags = form.catalog.records.get(FLAG) ?? [];
  const held = typeof value === 'string' ? value : '';
  const stray = held !== '' && !flags.includes(held);
  return (
    <div class="form-at" data-at={pointerOf(path)}>
      <FieldShell id={id} label={label} info={info} shown={shown}>
        <select
          id={id}
          class="field form-select"
          value={held}
          disabled={!form.canEdit}
          aria-invalid={shown.length > 0 ? 'true' : undefined}
          aria-describedby={describedBy(id, info, shown)}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(event) => form.set(path, event.currentTarget.value, label)}
        >
          {held === '' ? (
            <option value="">{flags.length === 0 ? 'No flags yet: make one in Logic' : 'Choose a flag…'}</option>
          ) : null}
          {stray ? <option value={held}>{held} (no such flag)</option> : null}
          {flags.map((flag) => (
            <option key={flag} value={flag}>
              {flagLabel(flag, form.names)}
            </option>
          ))}
        </select>
      </FieldShell>
    </div>
  );
}

/** On or off, for an on/off flag's value: written as true or false. */
export function OnOffSelect(props: { path: Path; value: unknown; label: string }) {
  const { path, value, label } = props;
  const form = useForm();
  const id = useUniqueId();
  const { shown, onFocus, onBlur } = useShownProblems(form.problemsAt(pointerOf(path)));
  const held = value === true ? 'on' : value === false ? 'off' : '';
  return (
    <div class="form-at" data-at={pointerOf(path)}>
      <FieldShell id={id} label={label} info={{}} shown={shown}>
        <select
          id={id}
          class="field form-select"
          value={held}
          disabled={!form.canEdit}
          aria-invalid={shown.length > 0 ? 'true' : undefined}
          aria-describedby={describedBy(id, {}, shown)}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(event) => form.set(path, event.currentTarget.value === 'on', label)}
        >
          {held === '' ? <option value="">{`${JSON.stringify(value)} (not on or off)`}</option> : null}
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
      </FieldShell>
    </div>
  );
}
