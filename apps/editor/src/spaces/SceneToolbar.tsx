/**
 * The Scene panel's toolbar (M5.1, docs/specs/viewport.md#the-toolbar): the gizmo's mode, snapping,
 * Add, Select more, Group into prefab, Delete and Frame, and in a space Terrain, whose row holds the
 * terrain tools (M5.3); then Quality and Stats (M5.7). Every button is 44 px; on a phone the bar
 * wraps rather than scrolls.
 */
import { SHAPES, spacePath } from '@eb/compiler';
import { MODEL } from '@eb/schema';
import { useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { Picker } from '../forms/Picker.tsx';
import { refChoices } from '../forms/refChoices.ts';
import { QualityTools } from '../perf/QualityTools.tsx';
import type { OpenProject } from '../projects/opened.ts';
import { NameRecord } from '../records/NameRecord.tsx';
import { namesOf } from '../records/names.ts';
import { TerrainTools } from '../terrain/TerrainTools.tsx';
import { addHere, deleteChosen, groupChosen } from './actions.ts';
import type { Mode } from './gizmoMath.ts';
import { liveOf } from './live.ts';
import { places } from './spaceEdits.ts';
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
  const [shown, setShown] = useState<'add' | 'group' | 'terrain' | null>(null);
  const canEdit = editing.access.value.kind === 'editing';
  const chosen = picked.value.length;
  const toggle = (what: 'add' | 'group' | 'terrain') => setShown(shown === what ? null : what);
  const open = openSpace.value;
  const space = liveOf(open)?.space;
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
        {open?.kind === 'space' ? (
          <button type="button" class="button" aria-expanded={shown === 'terrain'} onClick={() => toggle('terrain')}>
            Terrain
          </button>
        ) : null}
        <QualityTools />
      </fieldset>
      {shown === 'terrain' && open?.kind === 'space' && space ? <TerrainTools terrain={space.terrain} /> : null}
      {shown === 'add' && canEdit ? <AddRow project={project} done={() => setShown(null)} /> : null}
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

/**
 * What Add puts down: a shape, a placement of a prefab that doesn't place the file open (E061), a
 * record (M5.2), or a model record, the records that draw as themselves (M5.5).
 */
function AddRow({ project, done }: { project: OpenProject; done: () => void }) {
  const [choosing, setChoosing] = useState<'record' | 'model' | null>(null);
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
      <button type="button" class="button" aria-haspopup="dialog" onClick={() => setChoosing('model')}>
        Model…
      </button>
      <button type="button" class="button" aria-haspopup="dialog" onClick={() => setChoosing('record')}>
        Record…
      </button>
      {choosing ? (
        <Picker
          title={choosing === 'model' ? 'Place a model' : 'Place a record'}
          choices={refChoices(
            { kind: 'ref', to: choosing === 'model' ? [MODEL] : [...project.catalog.records.keys()].sort() },
            project.catalog.records,
            namesOf(project.index, project.catalog),
          )}
          current=""
          empty={
            choosing === 'model'
              ? 'The project has no models yet: import a .glb or .gltf in the Assets panel, then place it here.'
              : 'The project has no records yet: make one in the Records panel, then place it here.'
          }
          choose={(record) => {
            setChoosing(null);
            add({ record });
          }}
          close={() => setChoosing(null)}
        />
      ) : null}
    </fieldset>
  );
}
