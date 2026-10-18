/**
 * A value edited as JSON (M3.1): what the editor has no form for, such as a game's own effect or
 * event arguments (D36). It is written once what is typed is JSON of the right shape; until then
 * the box keeps it, with why it isn't written.
 */
import { useUniqueId } from '../app/ids.ts';
import { useDraft } from '../editing/draft.ts';
import { describedBy, FieldShell, type Problem } from '../forms/FieldShell.tsx';
import { pointerOf, useForm, useShownProblems } from '../forms/formContext.ts';
import type { Path } from '../forms/values.ts';

const pretty = (value: unknown): string => (value === undefined ? '' : JSON.stringify(value, null, 2));

/** What `text` is as a JSON object, or why it isn't one. */
function readObject(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === 'object' && value !== null && !Array.isArray(value))
      return { ok: true, value: value as Record<string, unknown> };
    return { ok: false, message: 'Write an object: { … }' };
  } catch (error) {
    return { ok: false, message: `Not JSON yet: ${(error as Error).message}` };
  }
}

export function JsonField(props: { label: string; path: Path; value: unknown; optional?: boolean }) {
  const { label, path, value, optional = false } = props;
  const form = useForm();
  const id = useUniqueId();
  const draft = useDraft(pretty(value));
  const text = draft.shown;
  const read = text.trim() === '' ? null : readObject(text);
  const local: Problem[] = draft.draft !== null && read && !read.ok ? [{ message: read.message }] : [];
  const info = { optional, description: 'Written as JSON, which the editor checks once it is saved.' };
  const { shown, onFocus, onBlur } = useShownProblems([...local, ...form.problemsAt(pointerOf(path))]);
  return (
    <div class="form-at" data-at={pointerOf(path)}>
      <FieldShell id={id} label={label} info={info} shown={shown}>
        <textarea
          id={id}
          class="field form-input mono logic-json"
          rows={Math.min(8, Math.max(2, text.split('\n').length))}
          value={text}
          readOnly={!form.canEdit}
          spellcheck={false}
          autocapitalize="none"
          autoComplete="off"
          data-project-field
          aria-invalid={shown.length > 0 ? 'true' : undefined}
          aria-describedby={describedBy(id, info, shown)}
          onFocus={onFocus}
          onBlur={() => {
            onBlur();
            if (local.length === 0) draft.clear();
          }}
          onInput={(event) => {
            const typed = event.currentTarget.value;
            draft.setDraft(typed);
            if (typed.trim() === '' && optional) return form.set(path, undefined, label);
            const parsed = readObject(typed);
            if (parsed.ok) form.set(path, parsed.value, label);
          }}
        />
      </FieldShell>
    </div>
  );
}
