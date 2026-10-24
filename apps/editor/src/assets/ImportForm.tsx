import { useEffect, useMemo, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { importPickAction } from '../models/actions.ts';
import { gltfNames, isModelFile, modelSize, pickBlocked, planPick } from '../models/modelImport.ts';
import type { OpenProject } from '../projects/opened.ts';
import { cleanFolder, fileName } from './assetPaths.ts';
import { EntryForm } from './EntryForm.tsx';
import { sizeText, today } from './media.ts';

type Names = ReadonlyMap<File, readonly string[] | string>;

/** What each .gltf picked names beside itself, or why it couldn't be read. */
async function readNames(files: readonly File[]): Promise<Names> {
  const names = new Map<File, readonly string[] | string>();
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.gltf')) continue;
    try {
      names.set(file, gltfNames(await file.text()));
    } catch (error) {
      names.set(file, error instanceof Error ? error.message : String(error));
    }
  }
  return names;
}

/**
 * Files chosen or dropped, with one provenance for all of them (D34): one step. Models are packed
 * into GLBs as they come in, a .gltf's files inside its own, each with a model record unless that
 * is unticked (M5.5).
 */
export function ImportForm({
  project,
  files,
  close,
}: {
  project: OpenProject;
  files: readonly File[];
  close: () => void;
}) {
  const folderId = useUniqueId();
  const recordsId = useUniqueId();
  const [folder, setFolder] = useState('');
  const [makeRecords, setMakeRecords] = useState(true);
  const [names, setNames] = useState<Names | null>(null);
  useEffect(() => {
    let live = true;
    void readNames(files).then((read) => live && setNames(read));
    return () => {
      live = false;
    };
  }, [files]);
  const plan = useMemo(
    () => (names ? planPick(files, names, cleanFolder(folder), project.catalog.assets) : null),
    [files, names, folder, project.catalog.assets],
  );
  const models = plan?.models ?? [];
  const taken = [...models, ...(plan?.others ?? [])].filter((p) => p.refused === null);
  const blocked = plan ? pickBlocked(plan) : 'The models are still being read.';
  const count = taken.length === 1 ? '1 file' : `${taken.length} files`;
  return (
    <EntryForm
      catalog={project.catalog}
      heading={files.length === 1 ? 'Import a file' : `Import ${files.length} files`}
      paths={taken.map((p) => p.path)}
      initial={{ date: today() }}
      goLabel={`Import ${count}`}
      blocked={blocked}
      go={async (entry) => {
        if (!plan) return false;
        const done = await importPickAction(plan, makeRecords, entry, project.catalog.records.get('model') ?? []);
        if (done) close();
        return done;
      }}
      cancel={close}
    >
      <ul class="import-files">
        {models.map((m) => (
          <li key={m.path}>
            <span class="mono">assets/{m.path}</span> <span class="muted">{sizeText(modelSize(m))}</span>
            {m.beside.length > 0 ? (
              <span class="muted"> with {m.beside.map((f) => fileName(f.name)).join(', ')} inside</span>
            ) : null}
            {m.refused ? <span class="field-problem"> {m.refused}</span> : null}
          </li>
        ))}
        {(plan?.others ?? []).map((p) => (
          <li key={p.path}>
            <span class="mono">assets/{p.path}</span> <span class="muted">{sizeText(p.file.size)}</span>
            {p.refused ? <span class="field-problem"> {p.refused}</span> : null}
          </li>
        ))}
      </ul>
      {files.some((file) => isModelFile(file.name)) ? (
        <>
          <p class="muted">Each model becomes one GLB, its geometry packed with Meshopt.</p>
          <div class="form-bool">
            <input
              id={recordsId}
              type="checkbox"
              class="form-check"
              checked={makeRecords}
              onChange={(event) => setMakeRecords(event.currentTarget.checked)}
            />
            <label for={recordsId} class="form-label">
              Make a model record for each, with a box collider
            </label>
          </div>
        </>
      ) : null}
      <div class="form-field">
        <div class="form-label-row">
          <label class="form-label" for={folderId}>
            Folder<span class="form-optional"> (optional)</span>
          </label>
        </div>
        <input
          id={folderId}
          class="field form-input"
          type="text"
          autoComplete="off"
          placeholder="By kind: images, audio, models, fonts"
          value={folder}
          onInput={(event) => setFolder(event.currentTarget.value)}
        />
      </div>
      <p class="muted">One provenance for them all. A file’s own can be changed once it is in.</p>
    </EntryForm>
  );
}
