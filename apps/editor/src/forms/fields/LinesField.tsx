import type { ValueDef } from '@eb/schema';
import { useUniqueId } from '../../app/ids.ts';
import { useDraft } from '../../editing/draft.ts';
import { describedBy, type FieldProps, FieldShell } from '../FieldShell.tsx';
import { pointerOf, useForm, useShownProblems } from '../formContext.ts';

type ListDef = Extract<ValueDef, { kind: 'list' }>;

/**
 * A list of text with `lines` (M7.2): one box, an item a line, in a monospace font and never
 * wrapped, so a tilemap's rows and edges read as the picture they are. Each change is the whole
 * list, as typed; a list that isn't text lines is shown as it is written.
 */
export function LinesField({ label, def, info, path, value }: FieldProps<ListDef>) {
  const form = useForm();
  const id = useUniqueId();
  const lines = Array.isArray(value) && value.every((line) => typeof line === 'string') ? (value as string[]) : null;
  const draft = useDraft(lines ? lines.join('\n') : JSON.stringify(value ?? []));
  const { shown, onFocus, onBlur } = useShownProblems(form.problemsAt(pointerOf(path)));
  const text = draft.shown;
  return (
    <FieldShell id={id} label={label} info={info} shown={shown}>
      <textarea
        id={id}
        class="field form-input form-lines"
        data-project-field={form.ownUndo ? undefined : true}
        value={text}
        rows={Math.min(24, Math.max(3, text.split('\n').length + 1))}
        wrap="off"
        spellcheck={false}
        readOnly={!form.canEdit || lines === null}
        aria-invalid={shown.length > 0 ? 'true' : undefined}
        aria-describedby={describedBy(id, info, shown)}
        onFocus={onFocus}
        onBlur={() => {
          onBlur();
          draft.clear();
        }}
        onInput={(event) => {
          const typed = event.currentTarget.value;
          draft.setDraft(typed);
          const next = typed === '' ? [] : typed.split('\n');
          form.set(path, next.length === 0 && info.optional && def.min === undefined ? undefined : next, label);
        }}
      />
    </FieldShell>
  );
}
