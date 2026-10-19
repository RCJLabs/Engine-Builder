import type { ValueDef } from '@eb/schema';
import { useEffect, useRef } from 'preact/hooks';
import { useUniqueId } from '../../app/ids.ts';
import { FieldNotes, type FieldProps, Legend, WrongShape } from '../FieldShell.tsx';
import { FieldView } from '../FieldView.tsx';
import { pointerOf, useForm } from '../formContext.ts';
import { emptyValue, moveItem, type Path } from '../values.ts';

type ListDef = Extract<ValueDef, { kind: 'list' }>;
const FOCUS_WAIT_MS = 2000;
/** One change to the list as a step, and where focus goes once it has rendered. */
type Change = (said: string, make: (list: unknown[]) => unknown[], focus: string) => void;

interface PendingFocus {
  readonly selector: string;
  readonly until: number;
  /** Stops listening for the person going on: once focus has moved, or the list has gone. */
  readonly stop: () => void;
}

/** Whatever the person does after a change cancels the focus it was to move. */
const GOING_ON = ['pointerdown', 'keydown', 'input', 'focusin'] as const;

/**
 * Focus to move into the list once a change shows, unless the person goes on first: taps, types
 * or moves focus. A tap doesn't focus the button it lands on (Safari's buttons, or Chromium on a
 * touch screen), so where focus was can't tell; on CI's phone, a number typed into the box tapped
 * next went into the new item when it showed (M3.7).
 */
function pendingFocus(selector: string, cancel: () => void): PendingFocus {
  const stop = () => {
    for (const type of GOING_ON) document.removeEventListener(type, goneOn, true);
  };
  const goneOn = () => {
    stop();
    cancel();
  };
  for (const type of GOING_ON) document.addEventListener(type, goneOn, true);
  return { selector, until: performance.now() + FOCUS_WAIT_MS, stop };
}

/**
 * A list: its items in order, each with buttons to move it up, down or out, and one to add an
 * item at the end. Buttons rather than dragging, so a thumb and a keyboard work the same. Each
 * change is its own step, and focus follows the item that moved, or goes to the one added.
 */
export function ListField({ label, def, info, path, value }: FieldProps<ListDef>) {
  const form = useForm();
  const id = useUniqueId();
  const box = useRef<HTMLFieldSetElement>(null);
  const focusNext = useRef<PendingFocus | null>(null);
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
    next.stop();
    focusNext.current = null;
    target?.focus();
  });
  useEffect(() => () => focusNext.current?.stop(), []);

  const change: Change = (said, make, focus) => {
    focusNext.current?.stop();
    focusNext.current = pendingFocus(focus, () => {
      focusNext.current = null;
    });
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
