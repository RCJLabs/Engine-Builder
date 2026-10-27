/**
 * The Logic panel's stages (M7.4, D86): each file under stages/, opening in the script editor with
 * its problems counted, and New stage, which writes one that plays at once (scripts/templates.ts).
 * A stage draws a 2D space in code; a space names it as its Stage, in the inspector.
 */
import { stagePath } from '@eb/script';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import { NameRecord } from '../records/NameRecord.tsx';
import { openStage } from '../scripts/open.ts';
import { createTextFiles } from '../scripts/scriptEdits.ts';
import { stageTemplate } from '../scripts/templates.ts';
import { trust } from '../scripts/trust.ts';

function newStage(project: OpenProject, id: string): void {
  // A stage the author writes here is theirs, as their first script is (D38).
  if (project.game.ids.length === 0 && project.game.stages.length === 0) trust.trust(project.trustKey);
  void editing
    .edit(`New stage ${id}`, (copy) => createTextFiles(copy, [[stagePath(id), stageTemplate(id)]]))
    .then(() => openStage(id));
}

export function StagesList({ project }: { project: OpenProject }) {
  const { game } = project;
  const heading = useUniqueId();
  const [naming, setNaming] = useState(false);
  const canEdit = editing.access.value.kind === 'editing';
  const problemsOf = (id: string) => game.problems.filter((p) => p.file === stagePath(id)).length;
  return (
    <section class="logic-subsection" aria-labelledby={heading}>
      <div class="logic-head">
        <h4 id={heading}>Stages</h4>
        {canEdit ? (
          <button type="button" class="button" onClick={() => setNaming(true)}>
            New stage
          </button>
        ) : null}
      </div>
      {naming ? (
        <NameRecord
          type="stage"
          ids={game.stages}
          label="Name of the new stage"
          action="Create"
          fileOf={stagePath}
          done={(id) => {
            setNaming(false);
            newStage(project, id);
          }}
          cancel={() => setNaming(false)}
        />
      ) : null}
      {game.stages.length === 0 ? (
        <p class="muted">
          No stages yet. A stage draws a 2D space in code, each frame on a canvas: TypeScript in stages/ that a space
          names as its Stage.
        </p>
      ) : (
        <ul class="logic-list">
          {game.stages.map((id) => (
            <li key={id}>
              <button type="button" class="logic-card" onClick={() => openStage(id)}>
                <span class="logic-title">{`${id}.ts`}</span>
                <span class="muted">
                  {problemsOf(id) > 0 ? `${problemsOf(id)} problem${problemsOf(id) === 1 ? '' : 's'}` : 'No problems'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
