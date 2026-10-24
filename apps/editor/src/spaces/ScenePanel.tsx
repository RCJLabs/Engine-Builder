import { useEffect } from 'preact/hooks';
import { current } from '../projects/opened.ts';
import { loadSpaces, spacesModule } from './load.ts';

/** The Scene panel (M5.1, D63): the project's spaces and prefabs, and the 3D view of the one open. */
export function ScenePanel() {
  const project = current.value;
  useEffect(() => {
    if (project) loadSpaces();
  }, [project]);
  const SceneBrowser = spacesModule.value?.SceneBrowser;
  return (
    <div class="panel scene-panel" data-panel="scene">
      <header class="panel-head">
        <h2>Scene</h2>
      </header>
      {!project ? (
        <p class="muted">Open a project to build its spaces here.</p>
      ) : SceneBrowser ? (
        <SceneBrowser project={project} />
      ) : (
        <p class="muted">Opening the spaces…</p>
      )}
    </div>
  );
}
