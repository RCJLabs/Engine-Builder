import type { ValueDef } from '@eb/schema';
import { useUniqueId } from '../../app/ids.ts';
import { useDraft } from '../../editing/draft.ts';
import { asWritten, describedBy, type FieldProps, FieldShell } from '../FieldShell.tsx';
import { pointerOf, useForm, useShownProblems } from '../formContext.ts';

type TextDef = Extract<ValueDef, { kind: 'text' }>;

/**
 * Text, written as typed. Emptying an optional field leaves it out of the record. Text with a
 * line break always gets a box that keeps line breaks: a one-line input would drop them.
 */
export function TextField({ label, def, info, path, value, quietLabel }: FieldProps<TextDef>) {
  const form = useForm();
  const id = useUniqueId();
  const draft = useDraft(typeof value === 'string' ? value : asWritten(value));
  const { shown, onFocus, onBlur } = useShownProblems(form.problemsAt(pointerOf(path)));
  const text = draft.shown;
  const attrs = {
    id,
    class: 'field form-input',
    // A field of the project: its undo keys undo the editor's steps, not the browser's text (undoKeys.ts).
    'data-project-field': form.ownUndo ? undefined : true,
    value: text,
    readOnly: !form.canEdit,
    'aria-invalid': shown.length > 0 ? ('true' as const) : undefined,
    'aria-describedby': describedBy(id, info, shown),
    onFocus,
    onBlur: () => {
      onBlur();
      draft.clear();
    },
    onInput: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
      const typed = event.currentTarget.value;
      draft.setDraft(typed);
      form.set(path, typed === '' && info.optional ? undefined : typed, label);
    },
  };
  return (
    <FieldShell id={id} label={label} info={info} shown={shown} quiet={quietLabel}>
      {def.multiline || text.includes('\n') ? (
        <textarea {...attrs} rows={3} />
      ) : (
        <input {...attrs} type="text" autoComplete="off" />
      )}
      {def.max !== undefined ? (
        <p class="form-count">
          {text.length} of {def.max}
        </p>
      ) : null}
    </FieldShell>
  );
}
