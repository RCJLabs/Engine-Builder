import { ASSET_TYPES, kindOfAsset } from '@eb/schema';
import { useRef, useState } from 'preact/hooks';
import type { OpenProject } from '../projects/opened.ts';
import { assetUsersOf } from '../records/recordIndex.ts';
import { RenameForm } from '../types/RenameForm.tsx';
import { deleteAssetsAction, renameAssetAction, replaceAssetAction } from './assetActions.ts';
import { entryOf } from './assetLog.ts';
import { cleanFolder, fileName, movePathProblem } from './assetPaths.ts';
import { EntryForm } from './EntryForm.tsx';
import { sizeText, today } from './media.ts';
import { pickFiles } from './pickFiles.ts';
import { keptEntry, replacementPath, replaceProblem } from './replacing.ts';

type Doing = 'rename' | 'delete' | { replace: File } | null;

/** The asset's name and path, with Rename or move, Replace and Delete: each one step, which undo takes back. */
export function AssetHead({ project, path, canEdit }: { project: OpenProject; path: string; canEdit: boolean }) {
  const [doing, setDoing] = useState<Doing>(null);
  const rename = useRef<HTMLButtonElement>(null);
  const replace = useRef<HTMLButtonElement>(null);
  const del = useRef<HTMLButtonElement>(null);
  const close = (focus: HTMLButtonElement | null) => {
    setDoing(null);
    focus?.focus();
  };
  const kind = kindOfAsset(path);
  const accept = kind ? ASSET_TYPES[kind].map((ext) => `.${ext}`).join(',') : undefined;
  return (
    <>
      <header class="record-head">
        <h3>{fileName(path)}</h3>
        {canEdit ? (
          <div class="form-actions">
            <button ref={rename} type="button" class="button" onClick={() => setDoing('rename')}>
              Rename or move
            </button>
            <button
              ref={replace}
              type="button"
              class="button"
              onClick={() => pickFiles({ multiple: false, accept }, ([file]) => file && setDoing({ replace: file }))}
            >
              Replace
            </button>
            <button ref={del} type="button" class="button danger" onClick={() => setDoing('delete')}>
              Delete
            </button>
          </div>
        ) : null}
      </header>
      <p class="muted mono">assets/{path}</p>
      {doing === 'rename' ? (
        <RenameForm
          label={`New path for ${fileName(path)}, inside assets/`}
          initial={path}
          shape={cleanFolder}
          check={(to) => movePathProblem(to, path, project.catalog.assets)}
          said={(to) => `Moves to assets/${to}, with its provenance; records that name it follow.`}
          done={(to) => {
            setDoing(null);
            void renameAssetAction(path, to);
          }}
          cancel={() => close(rename.current)}
        />
      ) : null}
      {doing !== null && typeof doing === 'object' ? (
        <ReplaceForm project={project} path={path} file={doing.replace} cancel={() => close(replace.current)} />
      ) : null}
      {doing === 'delete' ? <DeleteAsset project={project} path={path} cancel={() => close(del.current)} /> : null}
    </>
  );
}

/** New bytes for the asset, with their own provenance: the old entry's to start from (replacing.ts), dated today. */
function ReplaceForm(props: { project: OpenProject; path: string; file: File; cancel: () => void }) {
  const { project, path, file, cancel } = props;
  const to = replacementPath(path, file.name, project.catalog.assets);
  const blocked = replaceProblem(path, file);
  return (
    <EntryForm
      catalog={project.catalog}
      heading={`Replace with ${file.name}`}
      paths={[to]}
      initial={{ ...keptEntry(entryOf(project.catalog.assetsLog, path)), date: today() }}
      goLabel="Replace"
      blocked={blocked}
      go={async (entry) => replaceAssetAction(path, new Uint8Array(await file.arrayBuffer()), entry, to)}
      cancel={cancel}
    >
      <p class="muted">
        {sizeText(file.size)}.{' '}
        {to === path
          ? 'It keeps the path, so records that name it see the new file.'
          : `It goes to assets/${to}, and records that name the old file follow.`}
      </p>
    </EntryForm>
  );
}

/** Deleting asks first, saying which records name it: they keep the name, and show a problem until it is changed. */
function DeleteAsset({ project, path, cancel }: { project: OpenProject; path: string; cancel: () => void }) {
  const users = project.index ? assetUsersOf(project.index, path).length : 0;
  return (
    <div class="confirm">
      <p>
        Delete assets/{path} and its provenance?{' '}
        {users > 0
          ? `${users === 1 ? '1 record uses' : `${users} records use`} it, and will show a problem until ${users === 1 ? 'it names' : 'they name'} another file. `
          : ''}
        Undo brings it back.
      </p>
      <div class="form-actions">
        <button type="button" class="button danger" onClick={() => void deleteAssetsAction([path])}>
          Delete {fileName(path)}
        </button>
        <button type="button" class="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
