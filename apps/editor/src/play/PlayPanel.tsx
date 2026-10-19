import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { noteError } from '../app/state.ts';
import { current } from '../projects/opened.ts';

type ViewModule = typeof import('./PlayView.tsx');

/** The game and its screens load once a project is open, so the editor's start carries none of the renderer. */
const viewModule = signal<ViewModule | null>(null);
let loading = false;

function loadView(): void {
  if (loading) return;
  loading = true;
  import('./PlayView.tsx').then(
    (module) => {
      viewModule.value = module;
    },
    (error: unknown) => {
      loading = false;
      noteError(`The Play panel couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}

/** The Play panel (M4.1, D51): the open project played through its screens, and the screens to edit. */
export function PlayPanel() {
  const project = current.value;
  useEffect(() => {
    if (project) loadView();
  }, [project]);
  const PlayView = viewModule.value?.PlayView;
  return (
    <div class="panel" data-panel="play">
      <header class="panel-head">
        <h2>Play</h2>
      </header>
      {!project ? (
        <p class="muted">Open a project to play it here, through its screens.</p>
      ) : PlayView ? (
        <PlayView project={project} />
      ) : (
        <p class="muted">Opening the game…</p>
      )}
    </div>
  );
}
