import { type Signal, signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { noteError } from '../app/state.ts';
import { current } from '../projects/opened.ts';
import { loadSpaces, spacesModule } from '../spaces/load.ts';
import { chosen } from './selection.ts';

/**
 * A part of the inspector that loads when first wanted, as the dock loads only on desktop (M2.2):
 * the record form (M2.4), the type designer (M2.6), the asset inspector (M2.7), the script
 * editor with CodeMirror (M3.2), the scene editor (M3.11) and the screen editor (M4.1), each with the checks it runs, are more than the editor's start
 * should carry (Readings). The offline cache holds them like any other file.
 */
function later<T>(load: () => Promise<T>, what: string): { module: Signal<T | null>; load: () => void } {
  const module = signal<T | null>(null);
  let loading = false;
  return {
    module,
    load() {
      if (loading) return;
      loading = true;
      load().then(
        (loaded) => {
          module.value = loaded;
        },
        (error: unknown) => {
          loading = false;
          noteError(`${what} couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
        },
      );
    },
  };
}

const forms = later(() => import('./RecordForm.tsx'), 'The record form');
const designer = later(() => import('../types/TypeDesigner.tsx'), 'The type designer');
const assets = later(() => import('../assets/AssetInspector.tsx'), 'The asset inspector');
const scripts = later(() => import('../scripts/ScriptEditor.tsx'), 'The script editor');
const scenes = later(() => import('../scenes/SceneEditor.tsx'), 'The scene editor');
const screens = later(() => import('../screens/ScreenEditor.tsx'), 'The screen editor');

/** The Inspector panel: the form for the record chosen, the designer for the type, the asset, or the script. */
export function InspectorPanel() {
  const project = current.value;
  const pick = chosen.value;
  useEffect(() => {
    if (pick?.kind === 'record') forms.load();
    else if (pick?.kind === 'asset') assets.load();
    else if (pick?.kind === 'script') scripts.load();
    else if (pick?.kind === 'scene') scenes.load();
    else if (pick?.kind === 'ui') screens.load();
    else if (pick?.kind === 'space') loadSpaces();
    else if (pick) designer.load();
  }, [pick]);
  return (
    <div class="panel" data-panel="inspector">
      <header class="panel-head">
        <h2>Inspector</h2>
      </header>
      {!project ? (
        <p class="muted">Open a project to edit its records, types, assets, scripts and scenes here.</p>
      ) : !pick ? (
        <p class="muted">Choose a record, a type, an asset, a script or a scene to edit it here.</p>
      ) : (
        <Chosen />
      )}
    </div>
  );
}

function Chosen() {
  const project = current.value;
  const pick = chosen.value;
  if (!project || !pick) return null;
  if (pick.kind === 'record') {
    const RecordForm = forms.module.value?.RecordForm;
    // Keyed by the record, so one record's typing never shows in the next one's fields.
    return RecordForm ? (
      <RecordForm key={`${pick.type}/${pick.id}`} project={project} type={pick.type} id={pick.id} />
    ) : (
      <p class="muted">Opening {pick.id}…</p>
    );
  }
  if (pick.kind === 'asset') {
    const AssetInspector = assets.module.value?.AssetInspector;
    return AssetInspector ? (
      <AssetInspector key={pick.path} project={project} path={pick.path} />
    ) : (
      <p class="muted">Opening {pick.path}…</p>
    );
  }
  if (pick.kind === 'script') {
    const ScriptEditor = scripts.module.value?.ScriptEditor;
    return ScriptEditor ? (
      <ScriptEditor key={pick.id} project={project} id={pick.id} />
    ) : (
      <p class="muted">Opening scripts/{pick.id}.ts…</p>
    );
  }
  if (pick.kind === 'scene') {
    const SceneEditor = scenes.module.value?.SceneEditor;
    return SceneEditor ? (
      <SceneEditor key={pick.id} project={project} id={pick.id} />
    ) : (
      <p class="muted">Opening scenes/{pick.id}.ink…</p>
    );
  }
  if (pick.kind === 'space') {
    const ObjectForm = spacesModule.value?.ObjectForm;
    return ObjectForm ? <ObjectForm key={pick.path} project={project} /> : <p class="muted">Opening {pick.path}…</p>;
  }
  if (pick.kind === 'ui') {
    const ScreenEditor = screens.module.value?.ScreenEditor;
    return ScreenEditor ? (
      <ScreenEditor key={pick.path} project={project} path={pick.path} />
    ) : (
      <p class="muted">Opening {pick.path}…</p>
    );
  }
  const loaded = designer.module.value;
  if (!loaded) return <p class="muted">Opening the type designer…</p>;
  if (pick.kind === 'component') return <loaded.KindDesigner key={pick.id} project={project} kind={pick.id} />;
  return pick.kind === 'type' ? (
    <loaded.TypeDesigner key={pick.type} project={project} type={pick.type} />
  ) : (
    <loaded.NewType project={project} />
  );
}
