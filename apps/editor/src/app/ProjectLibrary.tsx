import { useEffect, useRef, useState } from 'preact/hooks';
import { canOpenFolders } from '../projects/folders.ts';
import type { LibraryEntry } from '../projects/library.ts';
import {
  busy,
  deleteStoredProject,
  exportStoredProject,
  folders,
  forgetFolder,
  importZip,
  library,
  newProject,
  openFolder,
  openStoredProject,
  reopenFolder,
  storage,
} from '../projects/session.ts';
import { sizeText } from '../projects/storage.ts';

/** What is stored in this browser and the folders opened lately, with the ways to add more. */
export function ProjectLibrary() {
  const [naming, setNaming] = useState(false);
  const zipInput = useRef<HTMLInputElement>(null);
  const idle = busy.value === null;
  return (
    <>
      <StorageLine />
      <div class="actions">
        <button type="button" class="button primary" disabled={!idle} onClick={() => setNaming(true)}>
          New project
        </button>
        <button type="button" class="button" disabled={!idle} onClick={() => zipInput.current?.click()}>
          Import zip
        </button>
        {canOpenFolders() ? (
          <button type="button" class="button" disabled={!idle} onClick={() => void openFolder()}>
            Open folder
          </button>
        ) : null}
        <input
          ref={zipInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          aria-label="Zip to import"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void importZip(file);
          }}
        />
      </div>
      {naming ? <NewProjectForm done={() => setNaming(false)} /> : null}
      <h3 class="list-title">In this browser</h3>
      {library.value === null ? (
        <p class="muted">Looking…</p>
      ) : library.value.length === 0 ? (
        <p class="muted">No projects yet. Start a new one or import a zip.</p>
      ) : (
        <ul class="rows" aria-label="Projects in this browser">
          {library.value.map((entry) => (
            <StoredRow key={entry.folder} entry={entry} idle={idle} />
          ))}
        </ul>
      )}
      {folders.value.length > 0 ? (
        <>
          <h3 class="list-title">Recent folders</h3>
          <ul class="rows" aria-label="Recent folders">
            {folders.value.map((record) => (
              <li key={record.key} class="row">
                <span class="row-text">
                  <strong>{record.name}</strong>
                </span>
                <span class="row-actions">
                  <button type="button" class="button" disabled={!idle} onClick={() => void reopenFolder(record)}>
                    Open
                  </button>
                  <button type="button" class="button" disabled={!idle} onClick={() => void forgetFolder(record)}>
                    Forget
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

function StorageLine() {
  const state = storage.value;
  if (!state) return null;
  const kept =
    state.kept === true
      ? 'The browser keeps them until you clear them.'
      : 'The browser may clear them when space runs low, so export zips as backups.';
  const used = state.used === null ? '' : ` ${sizeText(state.used)} used.`;
  return (
    <p class="storage-line muted">
      Projects here are stored in this browser. {kept}
      {used}
    </p>
  );
}

function NewProjectForm({ done }: { done: () => void }) {
  const [name, setName] = useState('');
  return (
    <form
      class="new-project"
      onSubmit={(event) => {
        event.preventDefault();
        void newProject(name).then(done);
      }}
    >
      <label for="new-project-name">Name</label>
      <input
        id="new-project-name"
        class="field"
        value={name}
        maxLength={100}
        required
        autoComplete="off"
        onInput={(event) => setName(event.currentTarget.value)}
      />
      <span class="row-actions">
        <button type="submit" class="button primary" disabled={name.trim() === '' || busy.value !== null}>
          Create
        </button>
        <button type="button" class="button" onClick={done}>
          Cancel
        </button>
      </span>
    </form>
  );
}

function StoredRow({ entry, idle }: { entry: LibraryEntry; idle: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  // Asked to confirm, focus goes to the choice that loses nothing.
  useEffect(() => {
    if (confirming) keep.current?.focus();
  }, [confirming]);
  const detail = entry.trouble ?? `${entry.id} · ${entry.version}`;
  return (
    <li class="row" data-folder={entry.folder}>
      <span class="row-text">
        <strong>{entry.name}</strong>
        <span class={entry.trouble ? 'trouble-text' : 'muted'}>{detail}</span>
      </span>
      {confirming ? (
        <span class="row-actions" key="confirm">
          <span class="confirm-text">Delete it from this browser?</span>
          <button
            type="button"
            class="button danger"
            disabled={!idle}
            onClick={() => void deleteStoredProject(entry.folder)}
          >
            Delete
          </button>
          <button type="button" class="button" ref={keep} onClick={() => setConfirming(false)}>
            Keep
          </button>
        </span>
      ) : (
        <span class="row-actions" key="actions">
          {entry.trouble ? null : (
            <>
              <button
                type="button"
                class="button"
                disabled={!idle}
                onClick={() => void openStoredProject(entry.folder)}
              >
                Open
              </button>
              <button
                type="button"
                class="button"
                disabled={!idle}
                onClick={() => void exportStoredProject(entry.folder)}
              >
                Export
              </button>
            </>
          )}
          <button type="button" class="button" disabled={!idle} onClick={() => setConfirming(true)}>
            Delete
          </button>
        </span>
      )}
    </li>
  );
}
