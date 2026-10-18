import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { noteError } from '../app/state.ts';
import { current } from '../projects/opened.ts';

type BrowserModule = typeof import('./LogicBrowser.tsx');

/** The sheets and flags load once a project is open, as the problems list does (M2.8). */
const browserModule = signal<BrowserModule | null>(null);
let loading = false;

function loadBrowser(): void {
  if (loading) return;
  loading = true;
  import('./LogicBrowser.tsx').then(
    (module) => {
      browserModule.value = module;
    },
    (error: unknown) => {
      loading = false;
      noteError(`The Logic panel couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}

/** The Logic panel (M3.1): the project's trigger sheets, their rows as cards, and its flags. */
export function LogicPanel() {
  const project = current.value;
  useEffect(() => {
    if (project) loadBrowser();
  }, [project]);
  const LogicBrowser = browserModule.value?.LogicBrowser;
  return (
    <div class="panel" data-panel="logic">
      <header class="panel-head">
        <h2>Logic</h2>
      </header>
      {!project ? (
        <p class="muted">Open a project to write its trigger sheets and flags here.</p>
      ) : LogicBrowser ? (
        <LogicBrowser project={project} />
      ) : (
        <p class="muted">Opening the sheets…</p>
      )}
    </div>
  );
}
