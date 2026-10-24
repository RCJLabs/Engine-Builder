/**
 * The 3D view of the open space or prefab (M5.1, D63), with three in its chunk: the view made once
 * it mounts, shown the file again after each change, its gizmo following the toolbar's mode and
 * the objects chosen. Keyed by the file, so another file starts its own view.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { deleteChosen, placeChosen } from './actions.ts';
import type { NameOf } from './build.ts';
import { attachGestures } from './gestures.ts';
import type { SpaceJson } from './spaceFile.ts';
import { aim, choose, frameAsked, gizmoMode, type OpenSpace, picked, selectMore, snapOn } from './state.ts';
import { type Backend, createView, type View } from './viewport.ts';

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function SceneView(props: {
  space: SpaceJson;
  prefabs: ReadonlyMap<string, SpaceJson>;
  open: OpenSpace;
  /** A placed record's name, for its label. */
  names?: NameOf;
}) {
  const { space, prefabs, names } = props;
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const shown = useRef('');
  const [backend, setBackend] = useState<Backend | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const showLatest = () => {
    const { space: s, prefabs: p, names } = latest.current;
    // Read again after any change to the project, it is drawn again only when it, a prefab or a
    // placed record's name changed.
    const named = s.objects.flatMap((o) => (o.record !== undefined ? [names?.(o.record) ?? ''] : []));
    const text = JSON.stringify([s, [...p], named]);
    if (text === shown.current) return;
    shown.current = text;
    view.current?.show(s, p, names);
  };

  useEffect(() => {
    let gone = false;
    let detach = () => {};
    const box = host.current;
    const drawn = canvas.current;
    if (!box || !drawn) return;
    createView(box, drawn).then(
      (made) => {
        if (gone) return made.dispose();
        view.current = made;
        made.setMode(gizmoMode.peek());
        showLatest();
        made.select(picked.peek());
        made.frame();
        aim.value = made.aim();
        detach = attachGestures(made, box, {
          snap: () => snapOn.peek(),
          many: () => selectMore.peek(),
          choose,
          place: (places, label) => {
            if (editing.access.peek().kind !== 'editing') return made.preview(null);
            void placeChosen(places, label);
          },
          remove: () => void deleteChosen(),
          moved: () => {
            aim.value = made.aim();
          },
        });
        setBackend(made.backend);
      },
      (error: unknown) => setFailed(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      gone = true;
      detach();
      view.current?.dispose();
      view.current = null;
    };
  }, []);

  useEffect(showLatest, [space, prefabs, names]);
  const mode = gizmoMode.value;
  const ids = picked.value;
  const framing = frameAsked.value;
  // The view takes the mode and the pick as the label says them, not a paint later: in that gap, a
  // tap found clear of the gizmo before its object was chosen landed on the gizmo that came with it.
  useLayoutEffect(() => view.current?.setMode(mode), [mode]);
  useLayoutEffect(() => view.current?.select(ids), [ids]);
  useEffect(() => {
    if (framing > 0) view.current?.frame();
  }, [framing]);

  const chosen = ids.length > 0 ? `, ${count(ids.length, 'object')} chosen` : '';
  return (
    <>
      <div
        ref={host}
        class="scene-view"
        role="application"
        aria-roledescription="3D view"
        aria-label={`${space.name}: ${count(space.objects.length, 'object')}${chosen}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the view takes keys (orbit, zoom, frame, delete), so it takes focus
        tabIndex={0}
        data-backend={backend ?? undefined}
      >
        <canvas ref={canvas} class="scene-canvas" />
        {failed ? (
          <p class="field-problem scene-note" role="alert">
            The 3D view couldn’t start: {failed}
          </p>
        ) : backend === null ? (
          <p class="muted scene-note">Starting the 3D view…</p>
        ) : null}
      </div>
      <p class="muted scene-help">
        Drag to orbit, two fingers or the right button to pan, pinch or the wheel to zoom; tap or click to choose. On a
        keyboard, arrows orbit, + and − zoom, F frames, Delete deletes; hold the right button and press W, A, S, D, Q or
        E to fly.
      </p>
    </>
  );
}
