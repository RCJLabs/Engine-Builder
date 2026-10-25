/**
 * The Scene toolbar's Navigation row (M6.2, D74, docs/specs/navigation.md#the-editor): Bake
 * navigation and Show navigation, with a line that says what is there: no navmesh yet, one baked
 * before the solids last changed, or the last bake's time, tiles and polygons. Every button is 44 px.
 */
import { useEffect } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import { liveOf } from '../spaces/live.ts';
import { openSpace } from '../spaces/state.ts';
import { bakeHere, navStatus } from './navActions.ts';
import { baking, navNow, showNav } from './navState.ts';

export function NavTools({ project }: { project: OpenProject }) {
  const open = openSpace.value;
  const live = liveOf(open);
  const status = navStatus(project, live);
  const canEdit = editing.access.value.kind === 'editing';
  const last = baking.value?.path === open?.path ? baking.value : null;
  useEffect(() => {
    navNow.value = open ? { path: open.path, ...status } : null;
  }, [open?.path, status.has, status.stale]);
  const words =
    last?.busy || (last && !status.stale)
      ? last.words
      : !status.has
        ? 'No navmesh yet: bake one so NPCs can walk here.'
        : status.stale
          ? 'Baked before the solids or terrain last changed: bake it again.'
          : 'Baked from the space as it is.';
  return (
    <fieldset class="scene-terrain">
      <legend class="visually-hidden">Navigation</legend>
      <button
        type="button"
        class="button"
        disabled={!canEdit || !live?.space || last?.busy === true}
        onClick={() => void bakeHere(project, live)}
      >
        Bake navigation
      </button>
      <button
        type="button"
        class="button"
        aria-pressed={showNav.value}
        onClick={() => {
          showNav.value = !showNav.value;
        }}
      >
        Show navigation
      </button>
      <p class="scene-note" role="status">
        {words}
      </p>
    </fieldset>
  );
}
