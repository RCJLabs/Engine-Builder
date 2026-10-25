/**
 * The 3D view of the open space or prefab (M5.1, D63), with three in its chunk: the view made once
 * it mounts, shown the file again after each change, its gizmo following the toolbar's mode and
 * the objects chosen, its terrain the brush chosen (M5.3), its environment drawn (M5.4), its placed
 * records drawn as their models (M5.5), its terrain's foliage grown (M5.6), at the quality tier
 * the editor holds (M5.7): a new tier makes the view again on a new canvas, its camera kept, since
 * three takes antialiasing only as its renderer is made. Keyed by the file, so another file starts
 * its own view.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { lookOf } from '../environment/look.ts';
import { PerfOverlay } from '../perf/PerfOverlay.tsx';
import { autoPick, quality, readAuto, statsShown, stepDown, tierNow } from '../perf/state.ts';
import { TIERS } from '../perf/tiers.ts';
import { writeStrokeHere } from '../terrain/actions.ts';
import { brushKind, brushNow } from '../terrain/state.ts';
import { deleteChosen, placeChosen } from './actions.ts';
import type { NameOf } from './build.ts';
import { attachGestures } from './gestures.ts';
import { lastShown } from './lastShown.ts';
import type { LiveSpace } from './live.ts';
import type { Orbit } from './orbit.ts';
import type { SpaceJson } from './spaceFile.ts';
import {
  aim,
  choose,
  frameAsked,
  gizmoMode,
  groundHeight,
  moveStep,
  type OpenSpace,
  objectBoxes,
  picked,
  selectMore,
  snapOn,
} from './state.ts';
import type { TerrainFiles } from './terrainView.ts';
import { type Backend, createView, type View } from './viewport.ts';

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function SceneView(props: {
  space: SpaceJson;
  prefabs: ReadonlyMap<string, SpaceJson>;
  open: OpenSpace;
  /** A placed record's name, for its label. */
  names?: NameOf;
  /** A space's terrain files, when it has a terrain. */
  terrain?: TerrainFiles;
  /** A space's environment, when it names one. */
  environment?: LiveSpace['environment'];
  /** What its placed records need to draw as models, when it places any. */
  models?: LiveSpace['models'];
  /** The foliage its terrain lists, when it lists any. */
  foliage?: LiveSpace['foliage'];
}) {
  const { space, prefabs, names, terrain, environment, models, foliage } = props;
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const shown = useRef(lastShown());
  const lit = useRef(lastShown());
  // The camera as the last view left it, for the view a new tier makes.
  const kept = useRef<Orbit | null>(null);
  const readPerf = useRef(() => view.current?.perf() ?? null).current;
  // Auto's tier waits for the device's hints; a tier picked by hand needn't.
  const [hinted, setHinted] = useState(autoPick.peek() !== null);
  const ready = hinted || quality.value !== 'auto';
  const tier = tierNow.value;
  const [backend, setBackend] = useState<Backend | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [unread, setUnread] = useState<string | null>(null);

  const showLatest = () => {
    const shownView = view.current;
    const { space: s, prefabs: p, names, models: m } = latest.current;
    // Read again after any change to the project, it is drawn again only when it, a prefab, a
    // placed record's name or what its models are drawn from changed.
    const named = s.objects.flatMap((o) => (o.record !== undefined ? [names?.(o.record) ?? ''] : []));
    const text = JSON.stringify([s, [...p], named, m?.key ?? null]);
    if (shown.current.due(text, shownView !== null)) shownView?.show(s, p, names, m);
    // The terrain's files are compared by the view, which decodes them only when they changed.
    if (!shownView) return;
    const record = latest.current.environment?.record ?? null;
    if (lit.current.due(JSON.stringify(record), true)) shownView.showEnvironment(record ? lookOf(record) : null);
    shownView.showFoliage(latest.current.foliage ?? []);
    setUnread(shownView.showTerrain(s.terrain ?? null, latest.current.terrain ?? null));
    groundHeight.value = shownView.terrain.grid() ? shownView.terrain.height : null;
    aim.value = shownView.aim();
  };

  useEffect(() => {
    if (!hinted) void readAuto().finally(() => setHinted(true));
  }, []);

  useEffect(() => {
    let gone = false;
    let detach = () => {};
    const box = host.current;
    const drawn = canvas.current;
    if (!box || !drawn || !ready) return;
    createView(box, drawn, TIERS[tier], stepDown).then(
      (made) => {
        if (gone) return made.dispose();
        view.current = made;
        objectBoxes.value = () => made.boxes();
        made.setMode(gizmoMode.peek());
        // A new view is shown everything afresh.
        shown.current = lastShown();
        lit.current = lastShown();
        showLatest();
        made.select(picked.peek());
        if (kept.current) made.setOrbit(kept.current);
        else made.frame();
        aim.value = made.aim();
        detach = attachGestures(made, box, {
          snap: () => snapOn.peek(),
          step: () => moveStep.peek(),
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
          brush: () => (editing.access.peek().kind === 'editing' && made.terrain.grid() !== null ? brushNow() : null),
          stroked: (stroke) => {
            const grid = made.terrain.grid();
            const layers = latest.current.space.terrain?.layers;
            const grown = (latest.current.foliage ?? []).map((f) => f.record?.name ?? f.id);
            if (grid && layers) void writeStrokeHere(stroke, grid, layers, grown);
          },
        });
        setBackend(made.backend);
      },
      (error: unknown) => setFailed(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      gone = true;
      groundHeight.value = null;
      detach();
      kept.current = view.current?.orbit() ?? kept.current;
      view.current?.dispose();
      view.current = null;
      setBackend(null);
    };
  }, [ready, tier]);

  useEffect(showLatest, [space, prefabs, names, terrain, environment, models, foliage]);
  const brush = brushKind.value;
  useEffect(() => {
    if (brush === null) view.current?.terrain.ring(null, 0);
  }, [brush]);
  const mode = gizmoMode.value;
  const ids = picked.value;
  const framing = frameAsked.value;
  // The view takes the mode, the pick and Frame as the label says them, not a paint later: in that
  // gap, a tap found clear of the gizmo before its object was chosen landed on the gizmo that came
  // with it, and a handle found just after Frame was pressed was where the camera had it before.
  useLayoutEffect(() => view.current?.setMode(mode), [mode]);
  useLayoutEffect(() => view.current?.select(ids), [ids]);
  useLayoutEffect(() => {
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
        <canvas key={tier} ref={canvas} class="scene-canvas" />
        {statsShown.value && backend !== null ? <PerfOverlay read={readPerf} /> : null}
        {failed ? (
          <p class="field-problem scene-note" role="alert">
            The 3D view couldn’t start: {failed}
          </p>
        ) : backend === null ? (
          <p class="muted scene-note">Starting the 3D view…</p>
        ) : unread ? (
          <p class="field-problem scene-note" role="alert">
            The terrain can’t be drawn: {unread}. Its problem is in the Problems panel.
          </p>
        ) : environment && environment.record === null ? (
          <p class="field-problem scene-note" role="alert">
            The environment “{environment.id}” can’t be drawn. Its problem is in the Problems panel.
          </p>
        ) : null}
      </div>
      <p class="muted scene-help">
        {brush !== null
          ? 'Drag to brush the terrain; two fingers pan and pinch, the right button orbits, and the wheel zooms. Camera in the terrain tools puts dragging back to orbiting.'
          : 'Drag to orbit, two fingers or the right button to pan, pinch or the wheel to zoom; tap or click to choose. On a keyboard, arrows orbit, + and − zoom, F frames, Delete deletes; hold the right button and press W, A, S, D, Q or E to fly.'}
      </p>
    </>
  );
}
