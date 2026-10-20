import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { noteError } from '../app/state.ts';
import { current } from '../projects/opened.ts';

type BrowserModule = typeof import('./WorldBrowser.tsx');

/** The maps and kinds load once a project is open, as the Logic panel's sheets do. */
const browserModule = signal<BrowserModule | null>(null);
let loading = false;

function loadBrowser(): void {
  if (loading) return;
  loading = true;
  import('./WorldBrowser.tsx').then(
    (module) => {
      browserModule.value = module;
    },
    (error: unknown) => {
      loading = false;
      noteError(`The World panel couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}

/** The World panel (M4.6, D56): the project's maps and the kinds of node on them. */
export function WorldPanel() {
  const project = current.value;
  useEffect(() => {
    if (project) loadBrowser();
  }, [project]);
  const WorldBrowser = browserModule.value?.WorldBrowser;
  return (
    <div class="panel" data-panel="world">
      <header class="panel-head">
        <h2>World</h2>
      </header>
      {!project ? (
        <p class="muted">Open a project to make its maps here.</p>
      ) : WorldBrowser ? (
        <WorldBrowser project={project} />
      ) : (
        <p class="muted">Opening the maps…</p>
      )}
    </div>
  );
}
