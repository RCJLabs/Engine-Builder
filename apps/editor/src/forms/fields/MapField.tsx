import { FIELD_NAME_PATTERN, type ValueDef } from '@eb/schema';
import { useId, useState } from 'preact/hooks';
import { FieldNotes, type FieldProps, WrongShape } from '../FieldShell.tsx';
import { FieldView } from '../FieldView.tsx';
import { pointerOf, useForm } from '../formContext.ts';
import { type Choice, Picker } from '../Picker.tsx';
import { emptyValue, renameKey, withKey } from '../values.ts';
import { refChoices } from './PickField.tsx';

type MapDef = Extract<ValueDef, { kind: 'map' }>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Why a typed key can't be used, or null when it can. */
function keyProblem(key: string, taken: ReadonlySet<string>): string | null {
  if (!FIELD_NAME_PATTERN.test(key)) return 'Keys start with a letter, then letters, digits, "_" or "-"';
  return taken.has(key) ? `“${key}” is a key already` : null;
}

/**
 * A map: entries of key and value in the order the file has them. Keys of records or of a type's
 * values are chosen from a list that leaves out the keys taken; other keys are typed. Renaming a
 * key keeps its entry in place.
 */
export function MapField({ label, def, info, path, value }: FieldProps<MapDef>) {
  const form = useForm();
  const id = useId();
  const [picking, setPicking] = useState<{ rename?: string } | null>(null);
  const entries = isObject(value) ? Object.entries(value) : null;
  const taken = new Set((entries ?? []).map(([key]) => key));
  const key = def.key;
  const all: Choice[] = !key
    ? []
    : key.kind === 'ref'
      ? refChoices(key, form.catalog.records)
      : key.values.map((v) => ({ value: v, label: v }));
  const free = (keep?: string) => all.filter((c) => c.value === keep || !taken.has(c.value));
  const update = (said: string, make: (map: Record<string, unknown>) => Record<string, unknown> | null) =>
    form.update(path, (current) => (isObject(current) ? (make(current) ?? current) : make({})), said);
  const add = (name: string) => update(`Add to ${label}`, (map) => withKey(map, name, emptyValue(def.of)));
  const rename = (from: string, to: string) => update(`Rename in ${label}`, (map) => renameKey(map, from, to));
  const problems = form.problemsAt(pointerOf(path));
  return (
    <fieldset class="form-group" aria-describedby={problems.length > 0 ? `${id}-problems` : undefined}>
      <legend class="form-legend">
        {label}
        {info.optional ? <span class="form-optional"> (optional)</span> : null}
      </legend>
      {value !== undefined && entries === null ? (
        <WrongShape value={value} what="map" canEdit={form.canEdit} replace={() => form.set(path, {}, label)} />
      ) : null}
      {(entries ?? []).map(([name, item]) => (
        <div class="form-item form-entry" key={name}>
          {key ? (
            <button
              type="button"
              class="field form-pick form-key"
              disabled={!form.canEdit}
              aria-label={`${label}: ${name}, change the key`}
              onClick={() => setPicking({ rename: name })}
            >
              <span class="mono">{name}</span>
            </button>
          ) : (
            <NameKey label={label} name={name} taken={taken} rename={(to) => rename(name, to)} />
          )}
          <div class="form-item-value">
            <FieldView
              label={`${label}: ${name}`}
              def={def.of}
              info={{}}
              path={[...path, name]}
              value={item}
              quietLabel
            />
          </div>
          <button
            type="button"
            class="icon-button"
            disabled={!form.canEdit}
            aria-label={`Remove ${name} from ${label}`}
            onClick={() => update(`Remove from ${label}`, (map) => withKey(map, name, undefined))}
          >
            ✕
          </button>
        </div>
      ))}
      {key ? (
        <div class="form-actions">
          <button
            type="button"
            class="button"
            disabled={!form.canEdit || free().length === 0}
            onClick={() => setPicking({})}
          >
            Add to {label}
          </button>
        </div>
      ) : (
        <NameKey label={label} taken={taken} rename={add} />
      )}
      {picking ? (
        <Picker
          title={picking.rename ? `A key for ${picking.rename}` : `Add to ${label}`}
          choices={free(picking.rename)}
          current={picking.rename ?? ''}
          empty="Every key is in use."
          choose={(chosen) => (picking.rename ? rename(picking.rename, chosen) : add(chosen))}
          close={() => setPicking(null)}
        />
      ) : null}
      <FieldNotes id={id} info={info} shown={problems} />
    </fieldset>
  );
}

/** A typed key: an entry's, renamed when the field is left, or a new one, added with its button. */
function NameKey(props: { label: string; name?: string; taken: ReadonlySet<string>; rename: (key: string) => void }) {
  const { label, name, taken, rename } = props;
  const form = useForm();
  const id = useId();
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? name ?? '';
  const others = new Set([...taken].filter((k) => k !== name));
  const problem = typed === null || typed === '' ? null : keyProblem(typed, others);
  const commit = () => {
    if (typed === null || typed === '' || problem || typed === name) return;
    rename(typed);
    setTyped(null);
  };
  return (
    <div class={name === undefined ? 'form-actions form-new-key' : 'form-key'}>
      <input
        id={id}
        class="field form-input"
        value={shown}
        readOnly={!form.canEdit}
        autoComplete="off"
        autocapitalize="none"
        spellcheck={false}
        aria-label={name === undefined ? `New key for ${label}` : `${label}: ${name}, key`}
        aria-invalid={problem ? 'true' : undefined}
        aria-describedby={problem ? `${id}-problems` : undefined}
        onInput={(event) => setTyped(event.currentTarget.value)}
        onChange={name === undefined ? undefined : commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
      {name === undefined ? (
        <button type="button" class="button" disabled={!form.canEdit || !typed || problem !== null} onClick={commit}>
          Add to {label}
        </button>
      ) : null}
      {problem ? (
        <div id={`${id}-problems`} class="form-problems">
          <p class="field-problem">{problem}</p>
        </div>
      ) : null}
    </div>
  );
}
