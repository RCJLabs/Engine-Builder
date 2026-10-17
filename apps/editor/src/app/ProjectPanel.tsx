import { busy, current, trouble } from '../projects/session.ts';
import { OpenProjectView } from './OpenProject.tsx';
import { ProjectLibrary } from './ProjectLibrary.tsx';

/** The Project panel: the stored projects and recent folders, or the project that is open. */
export function ProjectPanel() {
  const open = current.value;
  return (
    <div class="panel" data-panel="project">
      <header class="panel-head">
        <h2>Project</h2>
      </header>
      <p class="status" role="status">
        {busy.value ? `${busy.value}…` : ''}
      </p>
      {trouble.value ? (
        <p class="trouble" role="alert">
          {trouble.value}
        </p>
      ) : null}
      {open ? <OpenProjectView project={open} /> : <ProjectLibrary />}
    </div>
  );
}
