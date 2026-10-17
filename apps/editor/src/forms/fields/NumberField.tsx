import type { ValueDef } from '@eb/schema';
import { useUniqueId } from '../../app/ids.ts';
import { useDraft } from '../../editing/draft.ts';
import { asWritten, describedBy, type FieldProps, FieldShell, type Problem } from '../FieldShell.tsx';
import { pointerOf, useForm, useShownProblems } from '../formContext.ts';
import { parseNumber, roundToStep, sliderStep } from '../values.ts';

type NumberDef = Extract<ValueDef, { kind: 'int' | 'number' }>;

/**
 * The keyboard a phone shows. A field that can be negative gets the full one: iOS's number pads
 * have no minus key (WebKit bug 193825). Otherwise digits, with a decimal point unless whole.
 */
export const inputMode = (def: NumberDef) =>
  def.min === undefined || def.min < 0 ? 'text' : def.kind === 'int' ? 'numeric' : 'decimal';

/**
 * A number, typed into a text box rather than `type="number"`, which a scroll wheel can change
 * and which hides half-typed input (GOV.UK's reasons). What is typed is written once it is a
 * number; until then it stays in the box, with why. Bounded both ways, it gets a slider too.
 */
export function NumberField({ label, def, info, path, value, quietLabel }: FieldProps<NumberDef>) {
  const form = useForm();
  const id = useUniqueId();
  const draft = useDraft(typeof value === 'number' ? String(value) : asWritten(value));
  const typed = draft.shown;
  const empty = typed.trim() === '';
  const settled = parseNumber(typed) !== null || (empty && info.optional === true);
  const notYet =
    draft.draft === null || settled
      ? null
      : empty
        ? 'Enter a number'
        : 'Not a number yet: write digits, like 12 or 4.5';
  const all: readonly Problem[] = [...(notYet ? [{ message: notYet }] : []), ...form.problemsAt(pointerOf(path))];
  const { shown, onFocus, onBlur } = useShownProblems(all);
  const write = (text: string) => {
    draft.setDraft(text);
    if (text.trim() === '' && info.optional) return form.set(path, undefined, label);
    const n = parseNumber(text);
    if (n !== null) form.set(path, n, label);
  };
  return (
    <FieldShell id={id} label={label} info={info} shown={shown} quiet={quietLabel}>
      <input
        id={id}
        class="field form-input"
        type="text"
        inputMode={inputMode(def)}
        autoComplete="off"
        data-project-field={form.ownUndo ? undefined : true}
        value={typed}
        readOnly={!form.canEdit}
        aria-invalid={shown.length > 0 ? 'true' : undefined}
        aria-describedby={describedBy(id, info, shown)}
        onFocus={onFocus}
        onBlur={() => {
          onBlur();
          // What isn't a number yet stays in the box with why, rather than quietly going back.
          if (settled) draft.clear();
        }}
        onInput={(event) => write(event.currentTarget.value)}
      />
      {def.min !== undefined && def.max !== undefined ? (
        <Slider label={label} def={def} min={def.min} max={def.max} value={value} write={write} />
      ) : null}
    </FieldShell>
  );
}

function Slider(props: {
  label: string;
  def: NumberDef;
  min: number;
  max: number;
  value: unknown;
  write: (text: string) => void;
}) {
  const { label, def, min, max, value, write } = props;
  const form = useForm();
  const step = sliderStep(min, max, def.kind === 'int');
  const at = typeof value === 'number' ? Math.min(Math.max(value, min), max) : min;
  return (
    <input
      class="form-slider"
      type="range"
      min={min}
      max={max}
      step={step}
      value={at}
      disabled={!form.canEdit}
      aria-label={`${label}, slider`}
      onInput={(event) => write(String(roundToStep(Number(event.currentTarget.value), step)))}
    />
  );
}
