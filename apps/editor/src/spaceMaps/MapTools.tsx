/**
 * The Scene toolbar's Map row (M6.6, D78, docs/specs/markers.md#in-the-editor): Bake map, with a
 * line that says what is there: no map yet, one baked before the space last changed, or the last
 * bake's size. The button is 44 px, as every button of the toolbar is.
 */
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import { liveOf } from '../spaces/live.ts';
import { mapBaker, openSpace } from '../spaces/state.ts';
import { bakeMapHere, mapStatus } from './mapActions.ts';
import { mapBaking } from './mapState.ts';

export function MapTools({ project }: { project: OpenProject }) {
  const open = openSpace.value;
  const live = liveOf(open);
  const status = mapStatus(project, live);
  const canEdit = editing.access.value.kind === 'editing';
  const last = mapBaking.value?.path === open?.path ? mapBaking.value : null;
  const words =
    last?.busy || (last && !status.stale)
      ? last.words
      : !status.has
        ? 'No map yet: bake one so the Map screen can show this space.'
        : status.stale
          ? 'Baked before the space last changed: bake it again.'
          : 'Baked from the space as it is.';
  return (
    <fieldset class="scene-terrain">
      <legend class="visually-hidden">Map</legend>
      <button
        type="button"
        class="button"
        disabled={!canEdit || !live?.space || !mapBaker.value || last?.busy === true}
        onClick={() => void bakeMapHere(project, live)}
      >
        Bake map
      </button>
      <p class="scene-note" role="status">
        {words}
      </p>
    </fieldset>
  );
}
