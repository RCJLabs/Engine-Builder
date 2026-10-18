import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { noteError } from '../app/state.ts';
import { current } from '../projects/opened.ts';
import { countsText } from './collect.ts';
import { problemCount } from './count.ts';

type BrowserModule = typeof import('./ProblemBrowser.tsx');

/** The list and its tools load once a project is open, as the records table does (M2.5). */
const browserModule = signal<BrowserModule | null>(null);
let loading = false;

function loadBrowser(): void {
  if (loading) return;
  loading = true;
  import('./ProblemBrowser.tsx').then(
    (module) => {
      browserModule.value = module;
    },
    (error: unknown) => {
      loading = false;
      noteError(`The problems list couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}

/** The Problems panel (M2.8): every problem `eb validate` would give the open project, live. */
export function ProblemsPanel() {
  const project = current.value;
  useEffect(() => {
    if (project) loadBrowser();
  }, [project]);
  const counts = problemCount.value;
  const ProblemBrowser = browserModule.value?.ProblemBrowser;
  return (
    <div class="panel" data-panel="problems">
      <header class="panel-head">
        <h2>Problems</h2>
        {counts ? <span class="badge">{countsText(counts)}</span> : null}
      </header>
      {!project ? (
        <p class="muted">Open a project to see what `eb validate` would say about it.</p>
      ) : ProblemBrowser ? (
        <ProblemBrowser project={project} />
      ) : (
        <p class="muted">Opening the problems…</p>
      )}
    </div>
  );
}
