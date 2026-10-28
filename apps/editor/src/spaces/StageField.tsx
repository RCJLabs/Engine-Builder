/**
 * A 2D space's Stage (M7.4, D86, docs/specs/stages.md#the-editor), in the inspector with nothing
 * chosen: one of the project's stage files, which then draws the space in play, or none, when the
 * engine's own 2D stage does. The Scene panel goes on drawing the space with its built-in view.
 */
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import { openStage } from '../scripts/open.ts';
import { setSpaceStage } from './actions.ts';

const NONE = '';

export function StageField({ project, stage }: { project: OpenProject; stage: string | undefined }) {
  const field = useUniqueId();
  const help = useUniqueId();
  const canEdit = editing.access.value.kind === 'editing';
  const files = project.game.stages;
  // A stage named that isn't there stays offered, so the field shows what the file says (E095 says why).
  const offered = stage !== undefined && !files.includes(stage) ? [...files, stage] : files;
  return (
    <div class="form-field">
      <label for={field}>Stage</label>
      <select
        id={field}
        class="field form-select"
        aria-describedby={help}
        value={stage ?? NONE}
        disabled={!canEdit}
        onChange={(event) => {
          const next = (event.target as HTMLSelectElement).value;
          void setSpaceStage(next === NONE ? undefined : next);
        }}
      >
        <option value={NONE}>None: the engine draws it</option>
        {offered.map((id) => (
          <option key={id} value={id}>{`${id}.ts`}</option>
        ))}
      </select>
      <p id={help} class="form-help">
        {files.length === 0
          ? 'A stage draws this space in code, in play. Make one with New stage in the Logic panel.'
          : 'A stage draws this space in code, in play; the Scene panel draws it as ever.'}
      </p>
      {stage !== undefined && files.includes(stage) ? (
        <div class="form-actions">
          <button type="button" class="button" onClick={() => openStage(stage)}>
            {`Open ${stage}.ts`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
