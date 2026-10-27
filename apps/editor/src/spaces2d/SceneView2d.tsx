/**
 * The Scene panel's 2D view (M7.1, D83, docs/specs/2d-scenes.md#the-editor): a 2D space drawn as
 * play draws it, by the stage's drawFrame on a canvas of art pixels shown at a whole zoom,
 * pixelated, each clip on its first frame; the chosen ringed and the space's bounds outlined. A
 * click or a tap chooses by a frame's box; a drag on the chosen moves them in whole art pixels, the
 * arrow keys a pixel, or 8 with Shift; a drag elsewhere pans; the wheel, a pinch, + and − and the
 * toolbar's buttons zoom in whole steps; Frame fits the chosen, or the space. Loaded with the first
 * 2D space opened. Since M7.2 a chosen tilemap is painted by a press and a drag while a tile tool is
 * on, the stroke shown as it goes and kept as one step, and its rules shown over it when asked.
 */
import { FIT_DEFAULT, type TilemapFields } from '@eb/compiler';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { deleteChosen } from '../spaces/actions.ts';
import { placeObjects } from '../spaces/spaceEdits.ts';
import type { SpaceJson } from '../spaces/spaceFile.ts';
import { choose, frameAsked, type OpenSpace, pick, picked, selectMore } from '../spaces/state.ts';
import { type Point, viewCorner } from '../stage2d/camera.ts';
import { type Drawn, drawFrame, type Sheets } from '../stage2d/draw.ts';
import { drawnAt, onCanvas, type Rect, worldBox } from '../stage2d/place.ts';
import { sceneOf } from '../stage2d/scene.ts';
import { BACKDROP_DEFAULT, coveredBy } from '../stage2d/start.ts';
import { moveChosen } from './actions2d.ts';
import type { Painter } from './gestures2d.ts';
import { attachGestures } from './gestures2d.ts';
import { publishView2d } from './hook2d.ts';
import type { LiveSprites } from './liveSprites.ts';
import { tilePainter } from './painter2d.ts';
import { movedBy, nudgeOf, pickAt, topOf } from './pick2d.ts';
import { drawRules } from './rules2d.ts';
import { sheetsOf } from './sheets2d.ts';
import { aim2d, askZoom, zoomAsked, zoomShown } from './state2d.ts';
import { edgeStroke, paintStroke, tilemapOf } from './tileActions.ts';
import { withTilemap } from './tilemapEdits.ts';
import { edgeKind, showRules, tileChar, tileLayer, tileTool } from './tiles2d.ts';
import { artSize, framed, type View2d, zoomedAt } from './view2d.ts';

interface Props {
  readonly space: SpaceJson;
  readonly prefabs: ReadonlyMap<string, SpaceJson>;
  readonly open: OpenSpace;
  readonly sprites?: LiveSprites;
  readonly record: (key: string) => unknown;
}

const NO_SHEETS: Sheets = { record: () => undefined, image: () => undefined, width: () => 0 };
const STILL = new Map();
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function SceneView2d({ space, prefabs, open, sprites, record }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [css, setCss] = useState<Point>([0, 0]);
  const [view, setView] = useState<View2d | null>(null);
  const [sheets, setSheets] = useState<Sheets>(NO_SHEETS);
  const [moving, setMoving] = useState<Point | null>(null);
  const [stroke, setStroke] = useState<{ id: string; fields: TilemapFields } | null>(null);
  const drawn = useRef<Drawn[]>([]);
  const frames = useRef(0);
  const ids = picked.value;
  const canEdit = editing.access.value.kind === 'editing';
  const dpr = window.devicePixelRatio || 1;

  useEffect(() => {
    if (!sprites) return;
    let on = true;
    void sheetsOf(sprites).then((read) => on && setSheets(read));
    return () => {
      on = false;
    };
  }, [sprites]);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const read = () => setCss([el.clientWidth, el.clientHeight]);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A drop's preview stays until the file comes back moved, so the chosen never jump back first.
  useEffect(() => {
    setMoving(null);
    setStroke(null);
  }, [space]);
  // The tilemap chosen alone (M7.2): what the Tiles row paints, and what Show rules draws over.
  const mapId = ids.length === 1 && tilemapOf(space, ids[0] as string) ? (ids[0] as string) : null;
  const placed = useMemo(() => Object.fromEntries(prefabs), [prefabs]);
  const shown = useMemo(() => {
    const moved = moving ? placeObjects(space, movedBy(space, ids, moving)) : space;
    return stroke ? withTilemap(moved, stroke.id, stroke.fields) : moved;
  }, [space, moving, ids, stroke]);
  const items = useMemo(() => sceneOf(shown, placed, record), [shown, placed, record]);
  const repeats = useMemo(() => new Set(items.filter((i) => i.parallax?.repeat).map((i) => i.path)), [items]);
  const size = (space.size ?? coveredBy(items, sheets)) as Point;
  const bounds: Rect = { x: 0, y: 0, w: size[0], h: size[1] };
  // What the player sees at first, from the space's corner: an empty space is framed on it, not on a dot.
  const fit = (space.fit ?? FIT_DEFAULT) as Point;
  const whole: Rect[] = [bounds, { x: 0, y: 0, w: fit[0], h: fit[1] }];

  const latest = useRef({ view, css, ids, canEdit, repeats, size, items, space, mapId });
  latest.current = { view, css, ids, canEdit, repeats, size, items, space, mapId };
  const chosenBoxes = (centre: Point): Rect[] =>
    items
      .filter((item) => ids.includes(topOf(item.path)))
      .map((item) =>
        worldBox(
          item,
          drawnAt(item, centre),
          item.look.kind === 'sprite' ? sheets.record(item.look.sprite) : undefined,
        ),
      );
  const frameOn = (boxes: Rect[]) => {
    const next = framed(boxes, latest.current.css, dpr);
    if (next) setView(next);
  };

  useEffect(() => {
    if (view === null && css[0] > 0 && css[1] > 0) frameOn(whole);
  }, [css, view]);
  const framing = frameAsked.value;
  useEffect(() => {
    if (framing > 0 && view) frameOn(ids.length > 0 ? chosenBoxes(view.centre) : whole);
  }, [framing]);
  const zooming = zoomAsked.value;
  useEffect(() => {
    if (zooming.n > 0 && view) setView(zoomedAt(view, zooming.by, [css[0] / 2, css[1] / 2], css, dpr));
  }, [zooming.n]);

  useLayoutEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !view || css[0] === 0) return;
    const art = artSize(css, dpr, view.zoom);
    if (el.width !== art[0]) el.width = art[0];
    if (el.height !== art[1]) el.height = art[1];
    el.style.width = `${(art[0] * view.zoom) / dpr}px`;
    el.style.height = `${(art[1] * view.zoom) / dpr}px`;
    const backdrop = space.backdrop ?? BACKDROP_DEFAULT;
    drawn.current = drawFrame(ctx, {
      items,
      sheets,
      walking: STILL,
      camera: view.centre,
      view: art,
      t: 0,
      still: true,
      backdrop,
    });
    const mapItem = mapId && showRules.value ? items.find((i) => i.path === mapId) : undefined;
    const tileset = mapItem?.look.kind === 'tilemap' ? sheets.tileset?.(mapItem.look.map.tileset) : undefined;
    if (mapItem?.look.kind === 'tilemap' && tileset)
      drawRules(ctx, mapItem.look.map, tileset.record, mapItem.at, viewCorner(view.centre, art), art[1]);
    frames.current++;
    aim2d.value = view.centre;
    zoomShown.value = view.zoom;
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    return attachGestures(el, {
      hit: (at) => {
        const now = latest.current.view;
        if (!now) return null;
        const k = dpr / now.zoom;
        return pickAt(drawn.current, latest.current.repeats, [at[0] * k, at[1] * k]);
      },
      chosen: () => latest.current.ids,
      canMove: () => latest.current.canEdit,
      view: () => latest.current.view,
      setView,
      css: () => latest.current.css,
      dragging: setMoving,
      dropped: (by) => void moveChosen(by, false).then(() => setTimeout(() => setMoving(null), 1000)),
      tapped: (id, many) => choose(id, many || selectMore.value),
      paint: () => painterNow(latest.current, setStroke),
    });
  }, []);

  useEffect(
    () =>
      publishView2d({
        space: open.id,
        zoom: () => latest.current.view?.zoom ?? 0,
        centre: () => latest.current.view?.centre ?? [0, 0],
        size: () => latest.current.size,
        drawn: () => pageBoxes(host.current, latest.current.view, drawn.current, dpr),
        picked: () => picked.peek(),
        frames: () => frames.current,
        tilemap: () => {
          const { mapId: id, space: now } = latest.current;
          const fields = id ? tilemapOf(now, id) : undefined;
          return id && fields ? { id, ...fields } : undefined;
        },
      }),
    [open.id],
  );

  const onKey = (e: KeyboardEvent) => {
    const by = nudgeOf(e.key, e.shiftKey);
    if (by) {
      if (ids.length === 0 || !canEdit) return;
      e.preventDefault();
      void moveChosen(by, true);
    } else if (e.key === '+' || e.key === '=') askZoom(1);
    else if (e.key === '-') askZoom(-1);
    else if (e.key === 'f' || e.key === 'F') frameAsked.value++;
    else if (e.key === 'Escape') pick([]);
    else if ((e.key === 'Delete' || e.key === 'Backspace') && canEdit) void deleteChosen();
    else return;
    e.preventDefault();
  };

  const art = view ? artSize(css, dpr, view.zoom) : ([1, 1] as Point);
  const corner = view ? viewCorner(view.centre, art) : ([0, 0] as Point);
  const k = view ? view.zoom / dpr : 1;
  const onPage = (box: Rect) => {
    const at = onCanvas(box, corner, art[1]);
    return { left: `${at.x * k}px`, top: `${at.y * k}px`, width: `${at.w * k}px`, height: `${at.h * k}px` };
  };
  const chosen = ids.length > 0 ? `, ${count(ids.length, 'object')} chosen` : '';
  return (
    <>
      <div
        ref={host}
        class="scene-view view2d"
        role="application"
        aria-roledescription="2D view"
        aria-label={`${space.name}: ${count(space.objects.length, 'object')}${chosen}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the view takes keys (move, zoom, frame, delete), so it takes focus
        tabIndex={0}
        onKeyDown={onKey}
      >
        <canvas ref={canvas} class="view2d-canvas" />
        {view ? <div class="view2d-bounds" style={onPage(bounds)} /> : null}
        {view
          ? chosenBoxes(view.centre).map((box, i) => <div key={i} class="view2d-chosen" style={onPage(box)} />)
          : null}
      </div>
      <p class="muted scene-help">
        Tap or click to choose; drag what is chosen to move it, anywhere else to pan; pinch or the wheel to zoom. On a
        keyboard, arrows move the chosen a pixel, 8 with Shift; + and − zoom, F frames, Delete deletes. With a tilemap
        chosen and Paint, Erase or Edges on, a press and a drag paint it instead.
      </p>
    </>
  );
}

function pageBoxes(el: HTMLElement | null, view: View2d | null, drawn: readonly Drawn[], dpr: number) {
  if (!el || !view) return [];
  const rect = el.getBoundingClientRect();
  const [x0, y0, k] = [rect.left + el.clientLeft, rect.top + el.clientTop, view.zoom / dpr];
  return drawn.map((d) => ({
    path: d.path,
    ...(d.sprite ? { sprite: d.sprite } : {}),
    ...(d.clip ? { clip: d.clip } : {}),
    at: d.at,
    page: { x: x0 + d.box.x * k, y: y0 + d.box.y * k, w: d.box.w * k, h: d.box.h * k },
  }));
}

interface PaintNow {
  readonly canEdit: boolean;
  readonly mapId: string | null;
  readonly items: ReturnType<typeof sceneOf>;
  readonly space: SpaceJson;
}

/** The painter a press starts (M7.2): while a tile tool is on and a tilemap is chosen alone, else none. */
function painterNow(
  now: PaintNow,
  setStroke: (s: { id: string; fields: TilemapFields } | null) => void,
): Painter | null {
  const tool = tileTool.peek();
  const id = now.mapId;
  const item = id ? now.items.find((i) => i.path === id) : undefined;
  const fields = id ? tilemapOf(now.space, id) : undefined;
  if (!tool || !now.canEdit || !id || !fields || item?.look.kind !== 'tilemap') return null;
  const ch = tileChar.peek();
  if (tool === 'paint' && ch === null) return null;
  const layer = Math.min(tileLayer.peek(), fields.layers.length - 1);
  return tilePainter({
    place: { at: item.at, size: fields.size, tile: item.look.tile },
    fields,
    tool,
    layer,
    ch: ch ?? ' ',
    kind: edgeKind.peek(),
    preview: (next) => setStroke(next ? { id, fields: next } : null),
    commit: (cells, sides) =>
      void (tool === 'edges'
        ? edgeStroke(id, sides, edgeKind.peek())
        : paintStroke(id, layer, cells, tool === 'erase' ? ' ' : (ch as string))),
  });
}
