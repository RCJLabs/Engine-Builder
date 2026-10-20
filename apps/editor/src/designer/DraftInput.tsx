/**
 * A one-line input over a value in a file (M4.5): what is typed shows at once while its edit lands,
 * as the record form's fields hold theirs (editing/draft.ts), so a key pressed in between is kept.
 */
import { useDraft } from '../editing/draft.ts';

interface Props {
  readonly id: string;
  readonly stored: string;
  readonly write: (typed: string) => void;
  readonly canEdit: boolean;
  readonly placeholder?: string;
  readonly describedBy?: string | undefined;
  readonly invalid?: boolean;
}

export function DraftInput({ id, stored, write, canEdit, placeholder, describedBy, invalid }: Props) {
  const draft = useDraft(stored);
  return (
    <input
      id={id}
      class="field form-input"
      value={draft.shown}
      readOnly={!canEdit}
      autoComplete="off"
      spellcheck={false}
      data-project-field
      {...(placeholder ? { placeholder } : {})}
      aria-describedby={describedBy}
      aria-invalid={invalid ? 'true' : undefined}
      onBlur={draft.clear}
      onInput={(event) => {
        const typed = event.currentTarget.value;
        draft.setDraft(typed);
        write(typed);
      }}
    />
  );
}
