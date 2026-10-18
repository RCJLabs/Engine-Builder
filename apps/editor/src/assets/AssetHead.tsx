import { ASSET_TYPES, kindOfAsset, type Provenance } from '@eb/schema';
import { useRef, useState } from 'preact/hooks';
import type { OpenProject } from '../projects/opened.ts';
import { assetUsersOf } from '../records/recordIndex.ts';
import { RenameForm } from '../types/RenameForm.tsx';
import { deleteAssetsAction, renameAssetAction, replaceAssetAction } from './assetActions.ts';
import { entryOf } from './assetLog.ts';
import { cleanFolder, fileName, folderOf, freePath, movePathProblem } from './assetPaths.ts';
import { EntryForm } from './EntryForm.tsx';
import { LIMITS, sizeText, today } from './media.ts';
import { pickFiles } from './pickFiles.ts';

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

/** Where a replacement goes: the same path when its extension is the same, else beside it under a free name. */
export function replacementPath(path: string, name: string, taken: readonly string[]): string {
  const ext = (text: string) => (text.includes('.') ? text.slice(text.lastIndexOf('.')).toLowerCase() : '');
  if (ext(name) === ext(path)) return path;
  const stem = fileName(path).slice(0, fileName(path).length - ext(path).length);
  return freePath(
    folderOf(path),
    `${stem}${ext(name)}`,
    taken.filter((other) => other !== path),
  );
}

/**
 * New bytes for the asset, with their own provenance: the old entry's to start from, dated today
 * and without its hand edits, or nothing but the date over a stand-in. A file of another kind is
 * refused: the records that name this one ask for its kind.
 */
function ReplaceForm(props: { project: OpenProject; path: string; file: File; cancel: () => void }) {
  const { project, path, file, cancel } = props;
  const kind = kindOfAsset(path);
  const to = replacementPath(path, file.name, project.catalog.assets);
  const old = entryOf(project.catalog.assetsLog, path) as Partial<Provenance> | undefined;
  // A stand-in's entry says the editor made it, which real art over it never is.
  const kept =
    old && typeof old === 'object' && old.standIn !== true
      ? Object.fromEntries(Object.entries(old).filter(([key]) => key !== 'edits' && key !== 'date'))
      : {};
  const blocked =
    kindOfAsset(file.name) !== kind
      ? `Replace it with ${kind ? `another ${kind === 'audio' ? 'sound' : kind}` : 'a file of the same kind'}.`
      : file.size > LIMITS.file
        ? `Too big: ${sizeText(file.size)}, and the most is ${sizeText(LIMITS.file)}.`
        : null;
  return (
    <EntryForm
      catalog={project.catalog}
      heading={`Replace with ${file.name}`}
      paths={[to]}
      initial={{ ...kept, date: today() }}
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
