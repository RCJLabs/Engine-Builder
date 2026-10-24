/**
 * The Outliner (M5.1, docs/specs/viewport.md#the-outliner): every object of the open file, in
 * order, a placed prefab with its prefab's name. A row chooses its object, with Shift, Ctrl or
 * Select more for many, as the view does; Rename edits its name in place, the id staying.
 */
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import { renameChosen } from './actions.ts';
import { liveOf } from './live.ts';
import { nameOf, type SpaceJson, type SpaceObject } from './spaceFile.ts';
import { choose, openSpace, picked, selectMore } from './state.ts';

export function Outliner(_props: { project: OpenProject }) {
  const open = openSpace.value;
  const now = liveOf(open);
  const [renaming, setRenaming] = useState<string | null>(null);
  if (!open || !now) return <p class="muted">Opening {open?.path}…</p>;
  if (!now.space) return <p class="muted">{now.problem}</p>;
  if (now.space.objects.length === 0)
    return <p class="muted">Nothing here yet: Add puts a shape or a prefab in the view.</p>;
  const canEdit = editing.access.value.kind === 'editing';
  return (
    <ul class="outliner" aria-label={`Objects in ${now.space.name}`}>
      {now.space.objects.map((object) =>
        renaming === object.id ? (
          <li key={object.id}>
            <RenameRow object={object} done={() => setRenaming(null)} />
          </li>
        ) : (
          <Row
            key={object.id}
            object={object}
            prefabs={now.prefabs}
            canEdit={canEdit}
            rename={() => setRenaming(object.id)}
          />
        ),
      )}
    </ul>
  );
}

function Row(props: {
  object: SpaceObject;
  prefabs: ReadonlyMap<string, SpaceJson>;
  canEdit: boolean;
  rename: () => void;
}) {
  const { object, prefabs, canEdit, rename } = props;
  const chosen = picked.value.includes(object.id);
  const kind = object.prefab !== undefined ? (prefabs.get(object.prefab)?.name ?? object.prefab) : object.shape;
  return (
    <li class="outliner-item">
      <button
        type="button"
        class="outliner-row"
        aria-pressed={chosen}
        onClick={(event) => choose(object.id, event.shiftKey || event.ctrlKey || event.metaKey || selectMore.value)}
      >
        <span class="outliner-name">{nameOf(object)}</span> <span class="muted">{kind}</span>
      </button>
      {canEdit ? (
        <button type="button" class="button" aria-label={`Rename ${nameOf(object)}`} onClick={rename}>
          Rename
        </button>
      ) : null}
    </li>
  );
}

function RenameRow({ object, done }: { object: SpaceObject; done: () => void }) {
  const [typed, setTyped] = useState(nameOf(object));
  const box = useRef<HTMLInputElement>(null);
  const id = useUniqueId();
  useLayoutEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);
  return (
    <form
      class="new-record outliner-rename"
      onSubmit={(event) => {
        event.preventDefault();
        done();
        void renameChosen(object.id, typed);
      }}
    >
      <label for={id}>Name of {object.id}</label>
      <input
        ref={box}
        id={id}
        class="field"
        value={typed}
        maxLength={80}
        autoComplete="off"
        onInput={(event) => setTyped(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') done();
        }}
      />
      <div class="form-actions">
        <button type="submit" class="button primary">
          Save
        </button>
        <button type="button" class="button" onClick={done}>
          Cancel
        </button>
      </div>
    </form>
  );
}
