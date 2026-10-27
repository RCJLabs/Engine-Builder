/**
 * The Scene panel's toolbar over a 2D space (M7.1, D83, docs/specs/2d-scenes.md#the-editor): Add
 * (a sprite, a mark for walkers to go to, a prefab, a record), Select more, Group into prefab,
 * Delete, Frame, and the zoom by whole steps, said beside its buttons. No gizmo modes, grid, Drop,
 * terrain, navigation, map or quality: a 2D space has none of them. Every button is 44 px.
 */
import { spacePath } from '@eb/compiler';
import { SPRITE } from '@eb/schema';
import { useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { Picker } from '../forms/Picker.tsx';
import { refChoices } from '../forms/refChoices.ts';
import type { OpenProject } from '../projects/opened.ts';
import { NameRecord } from '../records/NameRecord.tsx';
import { namesOf } from '../records/names.ts';
import { deleteChosen, groupChosen } from '../spaces/actions.ts';
import { liveOf } from '../spaces/live.ts';
import { places } from '../spaces/spaceEdits.ts';
import { nameOf } from '../spaces/spaceFile.ts';
import { frameAsked, openSpace, picked, selectMore } from '../spaces/state.ts';
import { type Added2d, addFlat } from './actions2d.ts';
import { askZoom, zoomShown } from './state2d.ts';
import { ZOOM_MOST } from './view2d.ts';

export function Toolbar2d({ project }: { project: OpenProject }) {
  const [shown, setShown] = useState<'add' | 'group' | null>(null);
  const canEdit = editing.access.value.kind === 'editing';
  const chosen = picked.value.length;
  const zoom = zoomShown.value;
  const toggle = (what: 'add' | 'group') => setShown(shown === what ? null : what);
  return (
    <>
      <fieldset class="scene-toolbar">
        <legend class="visually-hidden">Scene tools</legend>
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
        <button type="button" class="button" disabled={zoom <= 1} onClick={() => askZoom(-1)}>
          Zoom out
        </button>
        <output class="scene-zoom" aria-live="polite">
          {zoom > 0 ? `${zoom}×` : ''}
        </output>
        <button type="button" class="button" disabled={zoom >= ZOOM_MOST} onClick={() => askZoom(1)}>
          Zoom in
        </button>
      </fieldset>
      {shown === 'add' && canEdit ? <AddRow2d project={project} done={() => setShown(null)} /> : null}
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

/** What Add puts in the middle of a 2D view: a sprite, a mark, a prefab that doesn't place the file open, a record. */
function AddRow2d({ project, done }: { project: OpenProject; done: () => void }) {
  const [choosing, setChoosing] = useState<'sprite' | 'record' | null>(null);
  const open = openSpace.value;
  const now = liveOf(open);
  const prefabs = [...(now?.prefabs ?? new Map())].filter(
    ([id]) => !(open?.kind === 'prefab' && now && places(now.prefabs, id, open.id)),
  );
  const add = (what: Added2d) => {
    done();
    void addFlat(what);
  };
  return (
    <fieldset class="scene-add">
      <legend class="visually-hidden">Add</legend>
      <button type="button" class="button" aria-haspopup="dialog" onClick={() => setChoosing('sprite')}>
        Sprite…
      </button>
      <button type="button" class="button" onClick={() => add({ mark: true })}>
        Mark
      </button>
      {prefabs.map(([id, prefab]) => (
        <button key={id} type="button" class="button" onClick={() => add({ prefab: id })}>
          {nameOf({ id, name: prefab.name, prefab: id })}
        </button>
      ))}
      <button type="button" class="button" aria-haspopup="dialog" onClick={() => setChoosing('record')}>
        Record…
      </button>
      {choosing ? (
        <Picker
          title={choosing === 'sprite' ? 'Place a sprite' : 'Place a record'}
          choices={refChoices(
            { kind: 'ref', to: choosing === 'sprite' ? [SPRITE] : [...project.catalog.records.keys()].sort() },
            project.catalog.records,
            namesOf(project.index, project.catalog),
          )}
          current=""
          empty={
            choosing === 'sprite'
              ? 'The project has no sprites yet: add the starter sprites in the Assets panel, or make a sprite record from a sheet.'
              : 'The project has no records yet: make one in the Records panel, then place it here.'
          }
          choose={(key) => {
            setChoosing(null);
            add(choosing === 'sprite' ? { sprite: key.slice(key.indexOf(':') + 1) } : { record: key });
          }}
          close={() => setChoosing(null)}
        />
      ) : null}
    </fieldset>
  );
}
