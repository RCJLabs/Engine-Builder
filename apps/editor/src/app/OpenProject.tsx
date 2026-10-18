import { busy, closeProject, copyCurrentIn, exportCurrent, type OpenProject } from '../projects/session.ts';
import { recordsLine } from '../projects/summary.ts';
import { TypeList } from '../records/TypeList.tsx';
import { EditState } from './EditState.tsx';
import { ProjectFields } from './ProjectFields.tsx';
import { ProjectKits } from './ProjectKits.tsx';

/** The open project: who it is, where it lives, what it holds and what is wrong with it. */
export function OpenProjectView({ project }: { project: OpenProject }) {
  const { summary } = project;
  const idle = busy.value === null;
  const where = project.where === 'browser' ? 'Stored in this browser.' : `Opened from the folder ${project.label}.`;
  return (
    <section class="open-project" aria-label="Open project">
      <h3>{summary.project?.name ?? project.label}</h3>
      <p class="muted">{where}</p>
      <EditState />
      {summary.project ? <ProjectFields project={summary.project} /> : null}
      <dl class="facts">
        <dt>Id</dt>
        <dd>{summary.project?.id ?? '–'}</dd>
        <dt>Files</dt>
        <dd>{summary.files}</dd>
        <dt>Records</dt>
        <dd>{recordsLine(summary)}</dd>
      </dl>
      {summary.problems.length > 0 ? (
        <ul class="problems" aria-label="Problems">
          {summary.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : (
        <p class="muted">No problems found.</p>
      )}
      {summary.project ? <ProjectKits on={summary.project.kits ?? []} /> : null}
      <TypeList project={project} />
      <div class="actions">
        <button type="button" class="button primary" disabled={!idle} onClick={() => void exportCurrent()}>
          Export zip
        </button>
        {project.where === 'folder' ? (
          <button type="button" class="button" disabled={!idle} onClick={() => void copyCurrentIn()}>
            Copy into this browser
          </button>
        ) : null}
        <button type="button" class="button" disabled={!idle} onClick={closeProject}>
          Close
        </button>
      </div>
    </section>
  );
}
