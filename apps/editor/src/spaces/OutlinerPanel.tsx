import { useEffect } from 'preact/hooks';
import { current } from '../projects/opened.ts';
import { loadSpaces, spacesModule } from './load.ts';
import { openSpace } from './state.ts';

/** The Outliner (M5.1, D63): every object of the space open in the Scene panel, in order. */
export function OutlinerPanel() {
  const project = current.value;
  const open = openSpace.value;
  useEffect(() => {
    if (project) loadSpaces();
  }, [project]);
  const Outliner = spacesModule.value?.Outliner;
  return (
    <div class="panel" data-panel="outliner">
      <header class="panel-head">
        <h2>Outliner</h2>
      </header>
      {!project || !open ? (
        <p class="muted">Open a space or a prefab in the Scene panel to see its objects here.</p>
      ) : Outliner ? (
        <Outliner project={project} />
      ) : (
        <p class="muted">Opening {open.path}…</p>
      )}
    </div>
  );
}
