/**
 * The Scene panel once a project is open (M5.1, D63): its list, or the space or prefab open with
 * the toolbar over the view. The view, with three, loads with the first one opened; the Outliner
 * and the object form, from here, with the panel.
 */
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { BackIcon } from '../app/icons.tsx';
import { noteError } from '../app/state.ts';
import type { OpenProject } from '../projects/opened.ts';
import { namesOf } from '../records/names.ts';
import { liveOf } from './live.ts';
import { SceneToolbar } from './SceneToolbar.tsx';
import { SpaceList } from './SpaceList.tsx';
import { closeSpace, type OpenSpace, openSpace } from './state.ts';
import '../styles/logic.css';
import '../styles/scene.css';

export { ObjectForm } from './ObjectForm.tsx';
export { Outliner } from './Outliner.tsx';

type ViewModule = typeof import('./SceneView.tsx');
const viewModule = signal<ViewModule | null>(null);
let loading = false;

function loadView(): void {
  if (loading) return;
  loading = true;
  import('./SceneView.tsx').then(
    (module) => {
      viewModule.value = module;
    },
    (error: unknown) => {
      loading = false;
      noteError(`The 3D view couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}

export function SceneBrowser({ project }: { project: OpenProject }) {
  const open = openSpace.value;
  return open ? <SpaceEditor project={project} open={open} /> : <SpaceList project={project} />;
}

function SpaceEditor({ project, open }: { project: OpenProject; open: OpenSpace }) {
  useEffect(loadView, []);
  const now = liveOf(open);
  const SceneView = viewModule.value?.SceneView;
  return (
    <div class="space-editor" data-space={open.path}>
      <div class="space-head">
        <button type="button" class="button" onClick={closeSpace}>
          <BackIcon />
          Back to the list
        </button>
        <p class="space-title">
          <strong>{now?.space?.name ?? open.id}</strong> <span class="muted">{open.path}</span>
        </p>
      </div>
      <SceneToolbar project={project} />
      {now === null ? (
        <p class="muted">Opening {open.path}…</p>
      ) : now.space === null ? (
        <p class="field-problem" role="alert">
          {now.problem} Its problem is in the Problems panel; fix the file there, or by hand, to see it here.
        </p>
      ) : SceneView ? (
        <SceneView
          key={open.path}
          space={now.space}
          prefabs={now.prefabs}
          open={open}
          names={namesOf(project.index, project.catalog)}
        />
      ) : (
        <p class="muted">Opening the 3D view…</p>
      )}
    </div>
  );
}
