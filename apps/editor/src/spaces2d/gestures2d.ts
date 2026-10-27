/**
 * The 2D view's pointer, as one set of handlers on its box (M7.1, D83, docs/specs/2d-scenes.md#the-
 * editor). A press on a chosen object and a drag moves the chosen, in whole art pixels; a press
 * anywhere else and a drag pans, the world following the finger; a press let go where it began
 * chooses what is under it, or nothing. Two fingers pinch the zoom in whole steps, and the wheel
 * zooms a step at the pointer. The middle and right buttons always pan.
 */
import type { Point } from '../stage2d/camera.ts';
import { dragBy } from './pick2d.ts';
import { panned, pinchSteps, toWorld, type View2d, zoomedAt } from './view2d.ts';

export interface Gesture2d {
  /** The top-level object under a point of the box, in CSS pixels from its top-left. */
  hit(at: Point): string | null;
  chosen(): readonly string[];
  canMove(): boolean;
  view(): View2d | null;
  setView(next: View2d): void;
  css(): Point;
  /** A drag of the chosen so far, in whole art pixels; null once it ends without moving them. */
  dragging(by: Point | null): void;
  /** A drag of the chosen let go, `by` whole art pixels from where it began. */
  dropped(by: Point): void;
  tapped(id: string | null, many: boolean): void;
}

/** A press that travels less than this, in CSS pixels, is a tap. */
const TAP = 4;

type Held =
  | { kind: 'move'; start: Point; view: View2d; by: Point }
  | { kind: 'pan'; start: Point; view: View2d; moved: boolean; hit: string | null; many: boolean }
  | { kind: 'pinch'; spread: number; mid: Point; view: View2d };

const spreadOf = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function attachGestures(box: HTMLElement, on: Gesture2d): () => void {
  const dpr = () => window.devicePixelRatio || 1;
  const points = new Map<number, Point>();
  let held: Held | null = null;
  const at = (e: PointerEvent | WheelEvent): Point => {
    const rect = box.getBoundingClientRect();
    return [e.clientX - rect.left - box.clientLeft, e.clientY - rect.top - box.clientTop];
  };

  const down = (e: PointerEvent) => {
    const view = on.view();
    if (!view) return;
    box.setPointerCapture(e.pointerId);
    points.set(e.pointerId, at(e));
    if (points.size === 2) {
      if (held?.kind === 'move') on.dragging(null);
      const [a, b] = [...points.values()] as [Point, Point];
      held = { kind: 'pinch', spread: spreadOf(a, b), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], view };
      return;
    }
    if (points.size > 2) return;
    const start = at(e);
    const hit = e.button === 0 ? on.hit(start) : null;
    held =
      hit !== null && on.chosen().includes(hit) && on.canMove()
        ? { kind: 'move', start, view, by: [0, 0] }
        : { kind: 'pan', start, view, moved: e.button !== 0, hit, many: e.shiftKey || e.ctrlKey || e.metaKey };
  };

  const move = (e: PointerEvent) => {
    if (!points.has(e.pointerId)) return;
    const now = at(e);
    points.set(e.pointerId, now);
    if (!held) return;
    if (held.kind === 'pinch') {
      const [a, b] = [...points.values()] as [Point, Point];
      if (!b) return;
      const steps = pinchSteps(held.spread, spreadOf(a, b), held.view.zoom);
      on.setView(zoomedAt(held.view, steps, held.mid, on.css(), dpr()));
      return;
    }
    const by: Point = [now[0] - held.start[0], now[1] - held.start[1]];
    if (held.kind === 'move') {
      const from = toWorld(held.view, held.start, on.css(), dpr());
      held.by = dragBy(from, toWorld(held.view, now, on.css(), dpr()));
      on.dragging(held.by);
      return;
    }
    if (!held.moved && Math.hypot(by[0], by[1]) < TAP) return;
    held.moved = true;
    on.setView(panned(held.view, held.view.centre, by, dpr()));
  };

  const up = (e: PointerEvent) => {
    if (!points.delete(e.pointerId)) return;
    const was = held;
    if (points.size > 0) {
      // One finger of a pinch lifted: the rest of it does nothing until it starts again.
      if (was?.kind !== 'pinch') held = null;
      return;
    }
    held = null;
    if (was?.kind === 'move') {
      // A drop keeps its preview: the view lets it go once the file comes back moved.
      if (was.by[0] !== 0 || was.by[1] !== 0) on.dropped(was.by);
      else {
        on.dragging(null);
        on.tapped(on.hit(was.start), e.shiftKey || e.ctrlKey || e.metaKey);
      }
    } else if (was?.kind === 'pan' && !was.moved) on.tapped(was.hit, was.many);
  };

  const wheel = (e: WheelEvent) => {
    const view = on.view();
    if (!view || e.deltaY === 0) return;
    e.preventDefault();
    on.setView(zoomedAt(view, e.deltaY < 0 ? 1 : -1, at(e), on.css(), dpr()));
  };
  const menu = (e: Event) => e.preventDefault();

  box.addEventListener('pointerdown', down);
  box.addEventListener('pointermove', move);
  box.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up);
  box.addEventListener('wheel', wheel, { passive: false });
  box.addEventListener('contextmenu', menu);
  return () => {
    box.removeEventListener('pointerdown', down);
    box.removeEventListener('pointermove', move);
    box.removeEventListener('pointerup', up);
    box.removeEventListener('pointercancel', up);
    box.removeEventListener('wheel', wheel);
    box.removeEventListener('contextmenu', menu);
  };
}
