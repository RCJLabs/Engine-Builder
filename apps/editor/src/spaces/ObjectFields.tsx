/**
 * The boxes an object's form and an override's share (M5.1, M5.2): a name, and three numbers for a
 * place, a turn or a scale. Typing joins into one step; what isn't a number yet stays in its box.
 * NumberRow is one labelled number, the terrain's and the environment's forms' (M5.3, M5.4).
 */
import { useUniqueId } from '../app/ids.ts';
import { useDraft } from '../editing/draft.ts';
import { parseNumber } from '../forms/values.ts';
import type { Vec3 } from './vec.ts';

export function TextBox(props: { id: string; value: string; canEdit: boolean; write: (text: string) => void }) {
  const draft = useDraft(props.value);
  return (
    <input
      id={props.id}
      class="field form-input"
      value={draft.shown}
      maxLength={80}
      autoComplete="off"
      readOnly={!props.canEdit}
      data-project-field
      onInput={(event) => {
        draft.setDraft(event.currentTarget.value);
        props.write(event.currentTarget.value);
      }}
      onBlur={draft.clear}
    />
  );
}

const AXES = ['x', 'y', 'z'] as const;

/** A triple with one axis changed. */
export const withAxis = (v: Vec3, axis: number, n: number): Vec3 =>
  v.map((value, i) => (i === axis ? n : value)) as unknown as Vec3;

/** Three numbers: a place, a turn or a scale; a box written says which axis, so the write is that axis's alone. */
export function Triple(props: {
  legend: string;
  value: Vec3;
  canEdit: boolean;
  above?: number;
  write: (axis: number, n: number) => void;
}) {
  const { legend, value, canEdit, above, write } = props;
  return (
    <fieldset class="object-triple">
      <legend>{legend}</legend>
      {AXES.map((axis, i) => (
        <NumberBox
          key={axis}
          label={axis}
          value={value[i] as number}
          canEdit={canEdit}
          above={above}
          write={(n) => write(i, n)}
        />
      ))}
    </fieldset>
  );
}

function NumberBox(props: {
  label: string;
  value: number;
  canEdit: boolean;
  above?: number;
  write: (n: number) => void;
}) {
  const { label, value, canEdit, above, write } = props;
  const draft = useDraft(String(value));
  const id = useUniqueId();
  const n = parseNumber(draft.shown);
  const fits = n !== null && (above === undefined || n > above);
  return (
    <span class="object-number">
      <label for={id}>{label}</label>
      <input
        id={id}
        class="field form-input"
        type="text"
        inputMode="text"
        autoComplete="off"
        value={draft.shown}
        readOnly={!canEdit}
        aria-invalid={draft.draft !== null && !fits ? 'true' : undefined}
        data-project-field
        onInput={(event) => {
          const text = event.currentTarget.value;
          draft.setDraft(text);
          const typed = parseNumber(text);
          if (typed !== null && (above === undefined || typed > above)) write(typed);
        }}
        onBlur={() => {
          if (fits) draft.clear();
        }}
      />
    </span>
  );
}

/** A labelled number, written as it is typed or, with `onLeave`, as the field is left, once it fits. */
export function NumberRow(props: {
  label: string;
  value: number;
  canEdit: boolean;
  /** Written as the field is left, or Enter pressed, rather than as each key lands. */
  onLeave?: boolean;
  fits: (n: number) => boolean;
  why: string;
  write: (n: number) => void;
}) {
  const { label, value, canEdit, onLeave, fits, why, write } = props;
  const id = useUniqueId();
  const whyId = useUniqueId();
  const draft = useDraft(String(value));
  const typed = parseNumber(draft.shown);
  const good = typed !== null && fits(typed);
  const commit = (text: string) => {
    const n = parseNumber(text);
    if (n !== null && fits(n) && n !== value) write(n);
  };
  return (
    <div class="form-field">
      <label for={id}>{label}</label>
      <input
        id={id}
        class="field form-input"
        type="text"
        inputMode="text"
        autoComplete="off"
        value={draft.shown}
        readOnly={!canEdit}
        aria-invalid={draft.draft !== null && !good ? 'true' : undefined}
        aria-describedby={draft.draft !== null && !good ? whyId : undefined}
        data-project-field
        onInput={(event) => {
          draft.setDraft(event.currentTarget.value);
          if (!onLeave) commit(event.currentTarget.value);
        }}
        onChange={(event) => {
          if (onLeave) commit(event.currentTarget.value);
        }}
        onBlur={() => {
          if (good) draft.clear();
        }}
      />
      {draft.draft !== null && !good ? (
        <p id={whyId} class="field-problem">
          {typed === null ? 'Not a number yet' : why}
        </p>
      ) : null}
    </div>
  );
}
