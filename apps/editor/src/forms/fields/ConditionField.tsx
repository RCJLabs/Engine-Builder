import { type Condition, checkCondition, describeCondition, parseCondition, printCondition } from '@eb/core';
import { useId } from 'preact/hooks';
import { useDraft } from '../../editing/draft.ts';
import { asWritten, describedBy, type FieldProps, FieldShell, type Problem } from '../FieldShell.tsx';
import { pointerOf, useForm, useShownProblems } from '../formContext.ts';

const isTree = (value: unknown): boolean => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A tree as text to edit: its canonical print when it is sound, else its JSON, to type over. */
const asText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (isTree(value) && checkCondition(value).length === 0) return printCondition(value as Condition);
  return asWritten(value);
};

/**
 * A condition, always edited as text (conditions.md), and written in the form the file holds it
 * (D31): text stays text, written as typed; a tree stays a tree, written once the text parses. A
 * new condition is text. Below it, the condition in words, or why the text doesn't parse.
 */
export function ConditionField({ label, info, path, value, quietLabel }: FieldProps) {
  const form = useForm();
  const id = useId();
  const tree = isTree(value);
  const draft = useDraft(asText(value));
  const text = draft.shown;
  const parsed = text.trim() === '' ? null : parseCondition(text);
  // Text the file holds gets its parse error from validation (E011); a tree's draft can't be written yet.
  const local: Problem[] = tree && draft.draft !== null && parsed && !parsed.ok ? [{ message: parsed.message }] : [];
  const { shown, onFocus, onBlur } = useShownProblems([...local, ...form.problemsAt(pointerOf(path))]);
  const write = (typed: string) => {
    draft.setDraft(typed);
    if (typed.trim() === '' && info.optional) return form.set(path, undefined, label);
    if (!tree) return form.set(path, typed, label);
    const read = parseCondition(typed);
    if (read.ok) form.set(path, read.condition, label);
  };
  return (
    <FieldShell id={id} label={label} info={info} shown={shown} quiet={quietLabel}>
      <textarea
        id={id}
        class="field form-input form-condition"
        rows={2}
        value={text}
        readOnly={!form.canEdit}
        spellcheck={false}
        autocapitalize="none"
        autoComplete="off"
        data-project-field
        placeholder="like: arena.day and not crowd.angry"
        aria-invalid={shown.length > 0 ? 'true' : undefined}
        aria-describedby={
          [describedBy(id, info, shown), parsed?.ok ? `${id}-words` : ''].filter(Boolean).join(' ') || undefined
        }
        onFocus={onFocus}
        onBlur={() => {
          onBlur();
          // A tree's draft that doesn't parse stays, with why, rather than quietly going back.
          if (!local.length) draft.clear();
        }}
        onInput={(event) => write(event.currentTarget.value)}
      />
      {parsed?.ok ? (
        <p id={`${id}-words`} class="form-help">
          Reads: {describeCondition(parsed.condition)}.
        </p>
      ) : null}
    </FieldShell>
  );
}
