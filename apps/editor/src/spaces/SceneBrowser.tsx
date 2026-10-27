/**
 * The Scene panel once a project is open (M5.1, D63): its list, or the space or prefab open with
 * the toolbar over the view. The view, with three, loads with the first one opened; a 2D space's
 * view (M7.1), with none of three, with the first 2D one; the Outliner and the object form, from
 * here, with the panel.
 */
import { is2d } from '@eb/compiler';
import { type Signal, signal } from '@preact/signals';
import { useEffect, useMemo } from 'preact/hooks';
import { BackIcon } from '../app/icons.tsx';
import { noteError } from '../app/state.ts';
import type { OpenProject } from '../projects/opened.ts';
import { namesOf } from '../records/names.ts';
import { figuresFrom } from './figureLook.ts';
import { liveOf } from './live.ts';
import { SceneToolbar } from './SceneToolbar.tsx';
import { SpaceList } from './SpaceList.tsx';
import { closeSpace, type OpenSpace, openSpace } from './state.ts';
import '../styles/logic.css';
import '../styles/scene.css';

export { ObjectForm } from './ObjectForm.tsx';
export { Outliner } from './Outliner.tsx';

type ViewModule = typeof import('./SceneView.tsx');
type FlatModule = typeof import('../spaces2d/SceneView2d.tsx');
const viewModule = signal<ViewModule | null>(null);
const flatModule = signal<FlatModule | null>(null);

/** One lazy chunk, loaded once: a failed load may be tried again. */
function lazily<T>(into: Signal<T | null>, load: () => Promise<T>, what: string): () => void {
  let loading = false;
  return () => {
    if (loading) return;
    loading = true;
    load().then(
      (module) => {
        into.value = module;
      },
      (error: unknown) => {
        loading = false;
        noteError(`The ${what} couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
      },
    );
  };
}

const loadView = lazily(viewModule, () => import('./SceneView.tsx'), '3D view');
const loadFlat = lazily(flatModule, () => import('../spaces2d/SceneView2d.tsx'), '2D view');

export function SceneBrowser({ project }: { project: OpenProject }) {
  const open = openSpace.value;
  return open ? <SpaceEditor project={project} open={open} /> : <SpaceList project={project} />;
}

function SpaceEditor({ project, open }: { project: OpenProject; open: OpenSpace }) {
  const now = liveOf(open);
  const flat = now?.space ? is2d(now.space) : null;
  useEffect(() => {
    if (flat === true) loadFlat();
    else if (flat === false) loadView();
  }, [flat]);
  const SceneView = viewModule.value?.SceneView;
  const SceneView2d = flatModule.value?.SceneView2d;
  // A placed actor's record as the index holds it, for the 2D view's figures: new with each index.
  const index = project.index;
  const recordOf = useMemo(() => (key: string) => index?.records.get(key)?.value, [index]);
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
      ) : flat ? (
        SceneView2d ? (
          <SceneView2d
            key={open.path}
            space={now.space}
            prefabs={now.prefabs}
            open={open}
            {...(now.sprites ? { sprites: now.sprites } : {})}
            record={recordOf}
          />
        ) : (
          <p class="muted">Opening the 2D view…</p>
        )
      ) : SceneView ? (
        <SceneView
          key={open.path}
          space={now.space}
          prefabs={now.prefabs}
          open={open}
          names={namesOf(project.index, project.catalog)}
          figures={figuresFrom((key) => project.index?.records.get(key)?.value)}
          terrain={now.terrain}
          environment={now.environment}
          models={now.models}
          foliage={now.foliage}
          nav={now.nav ?? null}
        />
      ) : (
        <p class="muted">Opening the 3D view…</p>
      )}
    </div>
  );
}
