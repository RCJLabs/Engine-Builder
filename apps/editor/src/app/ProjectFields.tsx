import { useEffect, useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { FIELD_LABELS, type ManifestField, manifestChange, manifestProblem } from '../editing/projectEdits.ts';
import type { ManifestProject } from '../projects/manifest.ts';

/** The open project's name and version, edited in place: the first things the editor edits (M2.3). */
export function ProjectFields({ project }: { project: ManifestProject }) {
  const canEdit = editing.access.value.kind === 'editing';
  return (
    <div class="project-fields">
      <Field field="name" label="Name" stored={project.name} canEdit={canEdit} />
      <Field field="version" label="Version" stored={project.version} canEdit={canEdit} />
    </div>
  );
}

/**
 * One field of project.json. What is typed shows at once; the stored value follows a moment later,
 * when the edit has been made. Typing that the field can't hold (an empty name) stays in the field
 * with the reason beside it, and goes back to the stored value when the field is left.
 */
function Field(props: { field: ManifestField; label: string; stored: string; canEdit: boolean }) {
  const { field, label, stored, canEdit } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const history = editing.session.value?.history.value;
  // Caught up with what was typed, or moved by undo or redo (which leave the history closed). Not
  // run on each keystroke: the first one after an undo would be wiped before its edit lands.
  useEffect(() => {
    if (draft === stored || (history && !history.open)) setDraft(null);
  }, [stored, history]);
  const shown = draft ?? stored;
  const problem = draft === null ? null : manifestProblem(field, draft);
  const id = `project-${field}`;
  return (
    <div class="field-row">
      <label for={id}>{label}</label>
      <input
        id={id}
        class="field"
        value={shown}
        readOnly={!canEdit}
        autoComplete="off"
        data-project-field
        aria-invalid={problem ? 'true' : undefined}
        aria-describedby={problem ? `${id}-problem` : undefined}
        onInput={(event) => {
          const typed = event.currentTarget.value;
          setDraft(typed);
          if (manifestProblem(field, typed)) return;
          void editing.edit(
            FIELD_LABELS[field],
            async (copy) => {
              const change = await manifestChange(copy, field, typed);
              return change ? [change] : [];
            },
            `project.json#${field}`,
          );
        }}
        onBlur={() => setDraft(null)}
      />
      {problem ? (
        <p id={`${id}-problem`} class="field-problem">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
