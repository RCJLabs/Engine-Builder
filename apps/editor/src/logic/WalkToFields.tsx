/**
 * walk-to's form (M6.2, D74, docs/specs/navigation.md#the-editor): an actor placed in a space, then
 * an object of that space, each picked from a list the spaces' read gives (where each actor stands).
 * A value no list has stays on it, marked, so the field shows the file; E079 says what is wrong.
 */
import { formatRef } from '@eb/core';
import type { Walkers } from '@eb/schema';
import { useUniqueId } from '../app/ids.ts';
import { describedBy, FieldShell } from '../forms/FieldShell.tsx';
import { pointerOf, useForm, useShownProblems } from '../forms/formContext.ts';
import type { Path } from '../forms/values.ts';
import { current } from '../projects/opened.ts';

const ACTOR = 'actor';

/** Where each placed actor stands, as the open project's spaces were last read. */
export const walkersNow = (): Walkers => current.value?.index?.flagsElsewhere?.walkers ?? new Map();

function PickSelect(props: {
  path: Path;
  value: unknown;
  label: string;
  choices: readonly { value: string; label: string }[];
  none: string;
  empty: string;
}) {
  const { path, value, label, choices, none, empty } = props;
  const form = useForm();
  const id = useUniqueId();
  const { shown, onFocus, onBlur } = useShownProblems(form.problemsAt(pointerOf(path)));
  const held = typeof value === 'string' ? value : '';
  const stray = held !== '' && !choices.some((c) => c.value === held);
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
          onChange={(event) => form.set(path, event.currentTarget.value, label)}
        >
          {held === '' ? <option value="">{choices.length === 0 ? empty : none}</option> : null}
          {stray ? <option value={held}>{`${held} (not there)`}</option> : null}
          {choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </FieldShell>
    </div>
  );
}

export function WalkToFields({ path, value }: { path: Path; value: Record<string, unknown> }) {
  const form = useForm();
  const walkers = walkersNow();
  const actor = typeof value.actor === 'string' ? value.actor : '';
  const actors = [...walkers.keys()].sort().map((id) => {
    const name = form.names?.(formatRef(ACTOR, id));
    return { value: id, label: name ? `${name} (${id})` : id };
  });
  const walker = walkers.get(actor);
  const objects = [...(walker?.objects ?? [])]
    .filter((p) => walker && p !== actor)
    .sort()
    .map((p) => ({ value: p, label: p }));
  return (
    <>
      <PickSelect
        path={[...path, 'actor']}
        value={value.actor}
        label="Who walks"
        choices={actors}
        none="Choose an actor…"
        empty="No actor is placed in a space yet"
      />
      <PickSelect
        path={[...path, 'to']}
        value={value.to}
        label={walker ? `To, in ${walker.space}` : 'To'}
        choices={objects}
        none="Choose where to…"
        empty={walker ? 'Its space has no objects' : 'Choose who walks first'}
      />
    </>
  );
}
