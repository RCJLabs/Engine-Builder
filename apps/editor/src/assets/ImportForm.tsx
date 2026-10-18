import { useMemo, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import type { OpenProject } from '../projects/opened.ts';
import { importAction } from './assetActions.ts';
import { cleanFolder } from './assetPaths.ts';
import { EntryForm } from './EntryForm.tsx';
import { importBlocked, planImport } from './importPlan.ts';
import { sizeText, today } from './media.ts';

/** Files chosen or dropped, with one provenance for all of them (D34): one step. */
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
  const [folder, setFolder] = useState('');
  const planned = useMemo(
    () => planImport(files, cleanFolder(folder), project.catalog.assets),
    [files, folder, project.catalog.assets],
  );
  const taken = planned.filter((p) => p.refused === null);
  const blocked = importBlocked(planned);
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
        const incoming = await Promise.all(
          taken.map(async (p) => ({ path: p.path, bytes: new Uint8Array(await p.file.arrayBuffer()) })),
        );
        const done = await importAction(incoming, entry);
        if (done) close();
        return done;
      }}
      cancel={close}
    >
      <ul class="import-files">
        {planned.map((p) => (
          <li key={p.path}>
            <span class="mono">assets/{p.path}</span> <span class="muted">{sizeText(p.file.size)}</span>
            {p.refused ? <span class="field-problem"> {p.refused}</span> : null}
          </li>
        ))}
      </ul>
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
