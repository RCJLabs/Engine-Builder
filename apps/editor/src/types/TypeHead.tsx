import { isRecordId } from '@eb/core';
import { useRef, useState } from 'preact/hooks';
import { slugify } from '../forms/labels.ts';
import { useDesign } from './designContext.ts';
import { RenameForm } from './RenameForm.tsx';
import { deleteTypeAction, renameTypeAction } from './typeActions.ts';
import { refersTo } from './typeFileChanges.ts';

/**
 * The type's name and file, with Rename and Delete: each one step, which undo takes back. A kit's
 * type (M3.3) has neither: its name is the kit's, and turning the kit off is how it goes.
 */
export function TypeHead() {
  const { type, title, file, canEdit, project, kit } = useDesign();
  const [doing, setDoing] = useState<'rename' | 'delete' | null>(null);
  const rename = useRef<HTMLButtonElement>(null);
  const del = useRef<HTMLButtonElement>(null);
  const close = (focus: HTMLButtonElement | null) => {
    setDoing(null);
    focus?.focus();
  };
  const names = project.catalog.names.filter((name) => name !== type);
  return (
    <>
      <header class="record-head">
        <h3>Type: {title}</h3>
        {canEdit && !kit ? (
          <>
            <button ref={rename} type="button" class="button" onClick={() => setDoing('rename')}>
              Rename
            </button>
            <button ref={del} type="button" class="button danger" onClick={() => setDoing('delete')}>
              Delete
            </button>
          </>
        ) : null}
      </header>
      <p class="muted mono">{file}</p>
      {doing === 'rename' ? (
        <RenameForm
          label={`New name for the type ${type}`}
          initial={type}
          shape={slugify}
          check={(name) =>
            !isRecordId(name)
              ? 'Use letters or digits'
              : names.includes(name)
                ? `There is a type ${name} already`
                : null
          }
          said={(name) => `Saved as types/${name}.json, its records in records/${name}/; refs to them follow.`}
          done={(name) => {
            setDoing(null);
            void renameTypeAction(type, name);
          }}
          cancel={() => close(rename.current)}
        />
      ) : null}
      {doing === 'delete' ? <DeleteType cancel={() => close(del.current)} /> : null}
    </>
  );
}

/** Deleting asks first, with what goes: refused while another type refers to this one, whose refs would break. */
function DeleteType({ cancel }: { cancel: () => void }) {
  const { type, title, project, titleOf } = useDesign();
  const users = [...project.catalog.types.values()]
    .filter((data) => data.type !== type && refersTo(data.file, type).length > 0)
    .map((data) => titleOf(data.type));
  const count = project.catalog.records.get(type)?.length ?? 0;
  return (
    <div class="confirm">
      {users.length > 0 ? (
        <p>
          {title} can’t be deleted while {users.join(', ')} {users.length === 1 ? 'refers' : 'refer'} to it. Change or
          remove those fields first.
        </p>
      ) : (
        <p>
          Delete {title} and its {count === 1 ? 'record' : `${count} records`}? Undo brings them back.
        </p>
      )}
      <div class="form-actions">
        {users.length === 0 ? (
          <button type="button" class="button danger" onClick={() => void deleteTypeAction(type, title)}>
            Delete {title}
          </button>
        ) : null}
        <button type="button" class="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
