/**
 * The Scene panel's toolbar (M5.1, docs/specs/viewport.md#the-toolbar): the gizmo's mode, snapping,
 * Add, Select more, Group into prefab, Delete and Frame. Every button is 44 px; on a phone the bar
 * wraps rather than scrolls.
 */
import { SHAPES, spacePath } from '@eb/compiler';
import { useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import { NameRecord } from '../records/NameRecord.tsx';
import { addHere, deleteChosen, groupChosen } from './actions.ts';
import type { Mode } from './gizmoMath.ts';
import { liveOf, places } from './live.ts';
import { nameOf } from './spaceFile.ts';
import { frameAsked, gizmoMode, openSpace, picked, selectMore, snapOn } from './state.ts';

const MODES: readonly { mode: Mode; label: string }[] = [
  { mode: 'move', label: 'Move' },
  { mode: 'turn', label: 'Turn' },
  { mode: 'scale', label: 'Scale' },
];

const SHAPE_NAMES: Record<(typeof SHAPES)[number], string> = {
  box: 'Box',
  sphere: 'Sphere',
  cylinder: 'Cylinder',
  plane: 'Plane',
};

export function SceneToolbar({ project }: { project: OpenProject }) {
  const [shown, setShown] = useState<'add' | 'group' | null>(null);
  const canEdit = editing.access.value.kind === 'editing';
  const chosen = picked.value.length;
  const toggle = (what: 'add' | 'group') => setShown(shown === what ? null : what);
  return (
    <>
      <fieldset class="scene-toolbar">
        <legend class="visually-hidden">Scene tools</legend>
        {MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            class="button"
            aria-pressed={gizmoMode.value === mode}
            onClick={() => {
              gizmoMode.value = mode;
            }}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          class="button"
          aria-pressed={snapOn.value}
          onClick={() => {
            snapOn.value = !snapOn.value;
          }}
        >
          Snap
        </button>
        <button
          type="button"
          class="button"
          aria-expanded={shown === 'add'}
          disabled={!canEdit}
          onClick={() => toggle('add')}
        >
          Add
        </button>
        <button
          type="button"
          class="button"
          aria-pressed={selectMore.value}
          onClick={() => {
            selectMore.value = !selectMore.value;
          }}
        >
          Select more
        </button>
        <button
          type="button"
          class="button"
          aria-expanded={shown === 'group'}
          disabled={!canEdit || chosen === 0}
          onClick={() => toggle('group')}
        >
          Group into prefab
        </button>
        <button type="button" class="button" disabled={!canEdit || chosen === 0} onClick={() => void deleteChosen()}>
          Delete
        </button>
        <button
          type="button"
          class="button"
          onClick={() => {
            frameAsked.value++;
          }}
        >
          Frame
        </button>
      </fieldset>
      {shown === 'add' && canEdit ? <AddRow done={() => setShown(null)} /> : null}
      {shown === 'group' && canEdit && chosen > 0 ? (
        <NameRecord
          type="prefab"
          ids={project.catalog.prefabs.map((p) => p.id)}
          label={`Name of the new prefab, made of ${chosen === 1 ? 'the object' : `the ${chosen} objects`} chosen`}
          action="Group"
          fileOf={(id) => spacePath('prefab', id)}
          done={(id, typed) => {
            setShown(null);
            void groupChosen(id, typed);
          }}
          cancel={() => setShown(null)}
        />
      ) : null}
    </>
  );
}

/** What Add puts down: a shape, or a placement of a prefab that doesn't place the file open (E061). */
function AddRow({ done }: { done: () => void }) {
  const open = openSpace.value;
  const now = liveOf(open);
  const prefabs = [...(now?.prefabs ?? new Map())].filter(
    ([id]) => !(open?.kind === 'prefab' && now && places(now.prefabs, id, open.id)),
  );
  const add = (what: Parameters<typeof addHere>[0]) => {
    done();
    void addHere(what);
  };
  return (
    <fieldset class="scene-add">
      <legend class="visually-hidden">Add</legend>
      {SHAPES.map((shape) => (
        <button key={shape} type="button" class="button" onClick={() => add({ shape })}>
          {SHAPE_NAMES[shape]}
        </button>
      ))}
      {prefabs.map(([id, prefab]) => (
        <button key={id} type="button" class="button" onClick={() => add({ prefab: id })}>
          {nameOf({ id, name: prefab.name, prefab: id })}
        </button>
      ))}
    </fieldset>
  );
}
