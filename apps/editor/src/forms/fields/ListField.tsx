import type { ValueDef } from '@eb/schema';
import { useEffect, useId, useRef } from 'preact/hooks';
import { FieldNotes, type FieldProps, WrongShape } from '../FieldShell.tsx';
import { FieldView } from '../FieldView.tsx';
import { pointerOf, useForm } from '../formContext.ts';
import { emptyValue, moveItem } from '../values.ts';

type ListDef = Extract<ValueDef, { kind: 'list' }>;

/**
 * A list: its items in order, each with buttons to move it up, down or out, and one to add an
 * item at the end. Buttons rather than dragging, so a thumb and a keyboard work the same. Each
 * change is its own step, and focus follows the item that moved, or goes to the one added.
 */
export function ListField({ label, def, info, path, value }: FieldProps<ListDef>) {
  const form = useForm();
  const id = useId();
  const box = useRef<HTMLFieldSetElement>(null);
  const focusNext = useRef<string | null>(null);
  const items = Array.isArray(value) ? value : null;
  const problems = form.problemsAt(pointerOf(path));
  const full = def.max !== undefined && (items?.length ?? 0) >= def.max;

  useEffect(() => {
    const selector = focusNext.current;
    if (!selector) return;
    focusNext.current = null;
    box.current?.querySelector<HTMLElement>(selector)?.focus();
  });

  const change = (said: string, make: (list: unknown[]) => unknown[], focus: string) => {
    focusNext.current = focus;
    form.update(path, (current) => make(Array.isArray(current) ? current : []), said);
  };
  const clear = info.optional && value !== undefined && form.canEdit;
  return (
    <fieldset ref={box} class="form-group" aria-describedby={problems.length > 0 ? `${id}-problems` : undefined}>
      <legend class="form-legend">
        {label}
        {info.optional ? <span class="form-optional"> (optional)</span> : null}
      </legend>
      {value !== undefined && items === null ? (
        <WrongShape value={value} what="list" canEdit={form.canEdit} replace={() => form.set(path, [], label)} />
      ) : null}
      {(items ?? []).map((item, i) => (
        <div class="form-item" key={i} data-item={i}>
          <div class="form-item-value">
            <FieldView
              label={`${label}, item ${i + 1}`}
              def={def.of}
              info={{}}
              path={[...path, i]}
              value={item}
              quietLabel
            />
          </div>
          <div class="form-item-tools">
            <button
              type="button"
              class="icon-button"
              data-move="up"
              disabled={!form.canEdit || i === 0}
              aria-label={`Move ${label} item ${i + 1} up`}
              onClick={() =>
                change(
                  `Move in ${label}`,
                  (list) => moveItem(list, i, i - 1),
                  `[data-item="${i - 1}"] [data-move="up"]`,
                )
              }
            >
              ↑
            </button>
            <button
              type="button"
              class="icon-button"
              data-move="down"
              disabled={!form.canEdit || i === (items?.length ?? 0) - 1}
              aria-label={`Move ${label} item ${i + 1} down`}
              onClick={() =>
                change(
                  `Move in ${label}`,
                  (list) => moveItem(list, i, i + 1),
                  `[data-item="${i + 1}"] [data-move="down"]`,
                )
              }
            >
              ↓
            </button>
            <button
              type="button"
              class="icon-button"
              disabled={!form.canEdit}
              aria-label={`Remove ${label} item ${i + 1}`}
              onClick={() => change(`Remove from ${label}`, (list) => list.filter((_, j) => j !== i), '[data-add]')}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <div class="form-actions">
        <button
          type="button"
          class="button"
          data-add
          disabled={!form.canEdit || full}
          onClick={() => {
            const at = items?.length ?? 0;
            change(
              `Add to ${label}`,
              (list) => [...list, emptyValue(def.of)],
              `[data-item="${at}"] :is(input, select, textarea, button)`,
            );
          }}
        >
          Add to {label}
        </button>
        {clear ? (
          <button type="button" class="button" onClick={() => form.set(path, undefined, label)}>
            Clear {label}
          </button>
        ) : null}
      </div>
      <FieldNotes id={id} info={info} shown={problems} />
    </fieldset>
  );
}
