/**
 * The boxes an object's form and an override's share (M5.1, M5.2): a name, and three numbers for a
 * place, a turn or a scale. Typing joins into one step; what isn't a number yet stays in its box.
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

/** Three numbers: a place, a turn or a scale. */
export function Triple(props: {
  legend: string;
  value: Vec3;
  canEdit: boolean;
  above?: number;
  write: (value: Vec3) => void;
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
          write={(n) => write(value.map((v, j) => (j === i ? n : v)) as unknown as Vec3)}
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
