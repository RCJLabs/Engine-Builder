/**
 * A row's When (M3.1, D36): the event, one the game declares (the engine's own until its scripts
 * have run, M3.2) or another written by hand, and the values its arguments must have for the row
 * to run. An argument left empty matches any.
 */
import { type Domain, formatRef, type Value } from '@eb/core';
import { useUniqueId } from '../app/ids.ts';
import { useDraft } from '../editing/draft.ts';
import { describedBy, FieldShell } from '../forms/FieldShell.tsx';
import { FieldView } from '../forms/FieldView.tsx';
import { pointerOf, useForm, useShownProblems } from '../forms/formContext.ts';
import type { Path } from '../forms/values.ts';
import { eventsOf, openGame } from '../scripts/known.ts';
import { JsonField } from './JsonField.tsx';
import { forEvent, withArg } from './sheetEdits.ts';

const OTHER = '';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function WhenField({ path, value }: { path: Path; value: unknown }) {
  const form = useForm();
  const id = useUniqueId();
  const when = isObject(value) ? value : {};
  const event = typeof when.event === 'string' ? when.event : '';
  const events = eventsOf(openGame());
  const info = events[event];
  const eventPath = [...path, 'event'];
  const { shown, onFocus, onBlur } = useShownProblems(form.problemsAt(pointerOf(eventPath)));
  const help = { description: 'A game’s own event is written as module/name, like voyage/arrived.' };
  return (
    <fieldset class="form-group logic-when" data-at={pointerOf(path)}>
      <legend class="form-legend">When</legend>
      <div class="form-at" data-at={pointerOf(eventPath)}>
        <FieldShell id={id} label="Event" info={{}} shown={info ? shown : []}>
          <select
            id={id}
            class="field form-select"
            value={info ? event : OTHER}
            disabled={!form.canEdit}
            aria-describedby={describedBy(id, {}, info ? shown : [])}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={(e) => {
              const picked = e.currentTarget.value;
              form.update(path, () => forEvent(picked), `Choose the event`);
            }}
          >
            {Object.entries(events).map(([name, about]) => (
              <option key={name} value={name}>
                {about.label ?? name}
              </option>
            ))}
            <option value={OTHER}>Another event, written by hand</option>
          </select>
        </FieldShell>
      </div>
      {info ? (
        Object.entries(info.args ?? {}).map(([name, domain]) => (
          <ArgField
            key={name}
            name={name}
            domain={domain}
            path={[...path, 'args', name]}
            value={isObject(when.args) ? when.args[name] : undefined}
            set={(next) =>
              form.update(path, (now) => withArg(now, name, next), next === undefined ? `Clear ${name}` : `Set ${name}`)
            }
          />
        ))
      ) : (
        <>
          <FieldView label="Event id" def={{ kind: 'text' }} info={help} path={eventPath} value={event} />
          <JsonField label="With these arguments" path={[...path, 'args']} value={when.args} optional />
        </>
      )}
    </fieldset>
  );
}

/** One argument's value, of the kind the event declares it, or nothing for any. */
function ArgField(props: {
  name: string;
  domain: Domain;
  path: Path;
  value: unknown;
  set: (next: Value | undefined) => void;
}) {
  const { name, domain, path, value, set } = props;
  const form = useForm();
  const id = useUniqueId();
  const { shown, onFocus, onBlur } = useShownProblems(form.problemsAt(pointerOf(path)));
  const info = { optional: true, description: `Any ${name} when left empty.` };
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  const common = {
    id,
    disabled: !form.canEdit,
    'aria-invalid': shown.length > 0 ? ('true' as const) : undefined,
    'aria-describedby': describedBy(id, info, shown),
    onFocus,
    onBlur,
  };
  const held = value === undefined ? '' : String(value);
  const draft = useDraft(held);
  const choices = choicesOf(domain, form.catalog.records, form.names);
  return (
    <div class="form-at" data-at={pointerOf(path)}>
      <FieldShell id={id} label={label} info={info} shown={shown}>
        {choices ? (
          <select
            {...common}
            class="field form-select"
            value={held}
            onChange={(e) => set(parsed(e.currentTarget.value, domain))}
          >
            <option value="">Any</option>
            {held !== '' && !choices.some(([v]) => v === held) ? (
              <option value={held}>{held} (not one of the choices)</option>
            ) : null}
            {choices.map(([v, shownAs]) => (
              <option key={v} value={v}>
                {shownAs}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...common}
            class="field form-input"
            inputMode={domain.type === 'int' || domain.type === 'number' ? 'decimal' : undefined}
            value={draft.shown}
            autoComplete="off"
            autocapitalize="none"
            spellcheck={false}
            data-project-field
            onBlur={() => {
              onBlur();
              draft.clear();
            }}
            onInput={(e) => {
              draft.setDraft(e.currentTarget.value);
              set(parsed(e.currentTarget.value, domain));
            }}
          />
        )}
      </FieldShell>
    </div>
  );
}

/** The values a select offers for a domain, as [value, shown]; undefined for one typed in a box. */
function choicesOf(
  domain: Domain,
  records: ReadonlyMap<string, readonly string[]>,
  names: ((key: string) => string | undefined) | undefined,
): [string, string][] | undefined {
  if (domain.type === 'bool')
    return [
      ['true', 'True'],
      ['false', 'False'],
    ];
  if (domain.type === 'enum') return domain.values.map((v) => [String(v), String(v)]);
  if (domain.type === 'ref') {
    return (records.get(domain.to) ?? []).map((id) => {
      const name = names?.(formatRef(domain.to, id));
      return [id, name ? `${name} (${id})` : id];
    });
  }
  return undefined;
}

/** What is typed or picked, as the argument's value: a number for a number, true or false for yes or no. */
function parsed(text: string, domain: Domain): Value | undefined {
  if (text === '') return undefined;
  if (domain.type === 'bool') return text === 'true';
  if (domain.type === 'int' || domain.type === 'number') {
    const n = Number(text);
    return Number.isFinite(n) && text.trim() !== '' ? n : text;
  }
  if (domain.type === 'enum') {
    const found = domain.values.find((v) => String(v) === text);
    return found ?? text;
  }
  return text;
}
