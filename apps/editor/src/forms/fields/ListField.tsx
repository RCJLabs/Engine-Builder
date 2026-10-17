import type { ValueDef } from '@eb/schema';
import { useEffect, useId, useRef } from 'preact/hooks';
import { FieldNotes, type FieldProps, Legend, WrongShape } from '../FieldShell.tsx';
import { FieldView } from '../FieldView.tsx';
import { pointerOf, useForm } from '../formContext.ts';
import { emptyValue, moveItem, type Path } from '../values.ts';

type ListDef = Extract<ValueDef, { kind: 'list' }>;
const FOCUS_WAIT_MS = 2000;
/** One change to the list as a step, and where focus goes once it has rendered. */
type Change = (said: string, make: (list: unknown[]) => unknown[], focus: string) => void;

/**
 * A list: its items in order, each with buttons to move it up, down or out, and one to add an
 * item at the end. Buttons rather than dragging, so a thumb and a keyboard work the same. Each
 * change is its own step, and focus follows the item that moved, or goes to the one added.
 */
export function ListField({ label, def, info, path, value }: FieldProps<ListDef>) {
  const form = useForm();
  const id = useId();
  const box = useRef<HTMLFieldSetElement>(null);
  const focusNext = useRef<{ selector: string; until: number } | null>(null);
  const items = Array.isArray(value) ? value : null;
  const problems = form.problemsAt(pointerOf(path));
  const full = def.max !== undefined && (items?.length ?? 0) >= def.max;

  // An added item shows only once its edit has landed and the record has been read again, which
  // can take renders: the target waits for it (seen failing on CI). An edit that never lands
  // gives up after FOCUS_WAIT_MS, so focus can't jump into the list later.
  useEffect(() => {
    const next = focusNext.current;
    if (!next) return;
    const target = box.current?.querySelector<HTMLElement>(next.selector);
    if (!target && performance.now() < next.until) return;
    focusNext.current = null;
    target?.focus();
  });

  const change: Change = (said, make, focus) => {
    focusNext.current = { selector: focus, until: performance.now() + FOCUS_WAIT_MS };
    form.update(path, (current) => make(Array.isArray(current) ? current : []), said);
  };
  const add = () =>
    change(
      `Add to ${label}`,
      (list) => [...list, emptyValue(def.of)],
      `[data-item="${items?.length ?? 0}"] :is(input, select, textarea, button)`,
    );
  return (
    <fieldset ref={box} class="form-group" aria-describedby={problems.length > 0 ? `${id}-problems` : undefined}>
      <Legend label={label} info={info} />
      {value !== undefined && items === null ? (
        <WrongShape value={value} what="list" canEdit={form.canEdit} replace={() => form.set(path, [], label)} />
      ) : null}
      {(items ?? []).map((item, i) => (
        <ListItem key={i} {...{ label, i, item, path, change }} of={def.of} last={i === (items?.length ?? 0) - 1} />
      ))}
      <div class="form-actions">
        <button type="button" class="button" data-add disabled={!form.canEdit || full} onClick={add}>
          Add to {label}
        </button>
        {info.optional && value !== undefined && form.canEdit ? (
          <button type="button" class="button" onClick={() => form.set(path, undefined, label)}>
            Clear {label}
          </button>
        ) : null}
      </div>
      <FieldNotes id={id} info={info} shown={problems} />
    </fieldset>
  );
}

function ListItem(props: {
  label: string;
  i: number;
  last: boolean;
  of: ValueDef;
  path: Path;
  item: unknown;
  change: Change;
}) {
  const { label, i, last, of, path, item, change } = props;
  const { canEdit } = useForm();
  const move = (to: number, way: 'up' | 'down') =>
    change(`Move in ${label}`, (list) => moveItem(list, i, to), `[data-item="${to}"] [data-move="${way}"]`);
  return (
    <div class="form-item" data-item={i}>
      <div class="form-item-value">
        <FieldView label={`${label}, item ${i + 1}`} def={of} info={{}} path={[...path, i]} value={item} quietLabel />
      </div>
      <div class="form-item-tools">
        <button
          type="button"
          class="icon-button"
          data-move="up"
          disabled={!canEdit || i === 0}
          aria-label={`Move ${label} item ${i + 1} up`}
          onClick={() => move(i - 1, 'up')}
        >
          ↑
        </button>
        <button
          type="button"
          class="icon-button"
          data-move="down"
          disabled={!canEdit || last}
          aria-label={`Move ${label} item ${i + 1} down`}
          onClick={() => move(i + 1, 'down')}
        >
          ↓
        </button>
        <button
          type="button"
          class="icon-button"
          disabled={!canEdit}
          aria-label={`Remove ${label} item ${i + 1}`}
          onClick={() => change(`Remove from ${label}`, (list) => list.filter((_, j) => j !== i), '[data-add]')}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
