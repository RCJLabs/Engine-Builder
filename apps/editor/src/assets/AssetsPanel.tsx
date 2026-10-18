import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { note } from '../app/state.ts';
import { current } from '../projects/opened.ts';

type BrowserModule = typeof import('./AssetBrowser.tsx');

/**
 * The browser and its import form load once a project is open, as the records table does
 * (M2.5): with the provenance checks they run, they are more than the editor's start should carry.
 */
const browserModule = signal<BrowserModule | null>(null);
let loading = false;

function loadBrowser(): void {
  if (loading) return;
  loading = true;
  import('./AssetBrowser.tsx').then(
    (module) => {
      browserModule.value = module;
    },
    (error: unknown) => {
      loading = false;
      note(`The asset browser couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}

/** The Assets panel (M2.7): every file under assets/, with its provenance. */
export function AssetsPanel() {
  const project = current.value;
  useEffect(() => {
    if (project) loadBrowser();
  }, [project]);
  const AssetBrowser = browserModule.value?.AssetBrowser;
  return (
    <div class="panel" data-panel="assets">
      <header class="panel-head">
        <h2>Assets</h2>
        {project ? (
          <span class="badge">
            {project.catalog.assets.length === 1 ? '1 file' : `${project.catalog.assets.length} files`}
          </span>
        ) : null}
      </header>
      {!project ? (
        <p class="muted">Open a project to see its images, sounds, models and fonts here.</p>
      ) : AssetBrowser ? (
        <AssetBrowser project={project} />
      ) : (
        <p class="muted">Opening the assets…</p>
      )}
    </div>
  );
}
