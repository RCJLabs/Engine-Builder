/**
 * The view's pointer and keys (M5.1, docs/specs/viewport.md#the-camera): a press on a handle drags
 * it; elsewhere a drag orbits (the right or middle button pans), two fingers pan and pinch, the
 * wheel zooms, and a tap or click chooses. On desktop, W, A, S, D, Q and E fly while the right
 * button is held; the keys also orbit, zoom, frame, delete and let go of what is chosen. With a
 * terrain's brush chosen (M5.3), one finger or the left button strokes the ground, two fingers pan
 * and pinch, and the right button orbits.
 */
import type { Brush } from '../terrain/brushes.ts';
import type { Stroke } from '../terrain/stroke.ts';
import type { Drag } from './drag.ts';
import type { Placed, Transform } from './gizmoMath.ts';
import type { Screen } from './handles.ts';
import { FLY_KEYS, flownBy, pannedBy, turnedBy, zoomedBy } from './orbit.ts';
import { snaps } from './snap.ts';
import type { View } from './viewport.ts';

export interface Wants {
  snap(): boolean;
  /** Whether a tap adds and takes away, as Select more makes it. */
  many(): boolean;
  choose(id: string | null, many: boolean): void;
  place(places: ReadonlyMap<string, Transform>, label: string): void;
  remove(): void;
  /** The view's middle on the ground moved, after the camera did. */
  moved(): void;
  /** The terrain's brush while one is chosen and the space can be edited; null moves the camera. */
  brush(): Brush | null;
  /** A stroke kept, as the pointer lifts: its file to be written as one step. */
  stroked(stroke: Stroke): void;
}

type Gesture =
  | { readonly kind: 'none' }
  | { readonly kind: 'press'; readonly id: number; readonly from: Screen; readonly button: number }
  | { readonly kind: 'orbit' | 'pan'; readonly id: number; at: Screen; readonly button: number }
  | {
      readonly kind: 'drag';
      readonly id: number;
      readonly drag: Drag;
      readonly start: readonly Placed[];
      last: readonly Placed[] | null;
      readonly label: string;
    }
  | { readonly kind: 'pinch'; gap: number; mid: Screen }
  | { readonly kind: 'stroke'; readonly id: number };

/** How far a press moves before it is a drag rather than a tap: further for a finger. */
const SLOP = { mouse: 4, touch: 10 } as const;
/** Metres a second the camera flies; three times that with Shift. */
const FLY_SPEED = 6;

const same = (a: readonly Placed[], b: readonly Placed[]) => JSON.stringify(a) === JSON.stringify(b);

function labelOf(kind: string, objects: readonly Placed[]): string {
  const verb = kind === 'turn' ? 'Turn' : kind === 'scale' || kind === 'scale-all' ? 'Scale' : 'Move';
  return objects.length === 1 ? `${verb} ${(objects[0] as Placed).id}` : `${verb} ${objects.length} objects`;
}

export function attachGestures(view: View, focusable: HTMLElement, wants: Wants): () => void {
  const { canvas } = view;
  const pointers = new Map<number, Screen>();
  let gesture: Gesture = { kind: 'none' };
  const flying = new Set<string>();
  let flyClock: number | null = null;

  const at = (event: PointerEvent): Screen => {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  const camera = (next: ReturnType<View['orbit']>) => {
    view.setOrbit(next);
    wants.moved();
  };
  const two = () => {
    const [a, b] = [...pointers.values()] as [Screen, Screen];
    return { gap: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Screen };
  };
  const letGo = () => {
    if (gesture.kind === 'drag') {
      view.preview(null);
      view.light(null);
    }
    // A second finger: the stroke it cut short goes back, as a pinch was meant.
    if (gesture.kind === 'stroke') {
      view.terrain.end(false);
      view.terrain.ring(null, 0);
    }
    gesture = { kind: 'none' };
  };

  const down = (event: PointerEvent) => {
    focusable.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, at(event));
    if (pointers.size === 2) {
      letGo();
      gesture = { kind: 'pinch', ...two() };
      return;
    }
    if (pointers.size > 2) return;
    const point = at(event);
    const brush = event.button === 0 ? wants.brush() : null;
    if (brush && view.terrain.start(view.rayAt(point), brush)) {
      view.terrain.ring(view.rayAt(point), brush.radius);
      gesture = { kind: 'stroke', id: event.pointerId };
      return;
    }
    const handle = event.button === 0 && !brush ? view.handleAt(point) : null;
    const grabbed = handle ? view.grab(handle, point) : null;
    if (handle && grabbed) {
      view.light(handle);
      const label = labelOf(handle.kind, grabbed.objects);
      gesture = { kind: 'drag', id: event.pointerId, drag: grabbed.drag, start: grabbed.objects, last: null, label };
      return;
    }
    gesture = { kind: 'press', id: event.pointerId, from: point, button: event.button };
  };

  const move = (event: PointerEvent) => {
    const point = at(event);
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, point);
    const g = gesture;
    if (g.kind === 'pinch' && pointers.size === 2) {
      const now = two();
      camera(
        pannedBy(
          zoomedBy(view.orbit(), now.gap / Math.max(1, g.gap)),
          now.mid[0] - g.mid[0],
          now.mid[1] - g.mid[1],
          view.size().h,
        ),
      );
      gesture = { kind: 'pinch', ...now };
    } else if (g.kind === 'press' && g.id === event.pointerId) {
      const slop = event.pointerType === 'mouse' ? SLOP.mouse : SLOP.touch;
      if (Math.hypot(point[0] - g.from[0], point[1] - g.from[1]) < slop) return;
      const orbits = g.button === 0 || (g.button === 2 && wants.brush() !== null);
      gesture = { kind: orbits ? 'orbit' : 'pan', id: g.id, at: g.from, button: g.button };
      move(event);
    } else if ((g.kind === 'orbit' || g.kind === 'pan') && g.id === event.pointerId) {
      const [dx, dy] = [point[0] - g.at[0], point[1] - g.at[1]];
      g.at = point;
      camera(g.kind === 'orbit' ? turnedBy(view.orbit(), dx, dy) : pannedBy(view.orbit(), dx, dy, view.size().h));
    } else if (g.kind === 'drag' && g.id === event.pointerId) {
      const placed = g.drag.update(view.rayAt(point), point, snaps(wants.snap(), event.ctrlKey || event.metaKey));
      if (!placed) return;
      g.last = placed;
      view.preview(placed);
    } else if (g.kind === 'stroke' && g.id === event.pointerId) {
      const ray = view.rayAt(point);
      view.terrain.to(ray);
      view.terrain.ring(ray, wants.brush()?.radius ?? 0);
    } else if (g.kind === 'none' && event.pointerType === 'mouse' && event.buttons === 0) {
      const brush = wants.brush();
      if (brush) view.terrain.ring(view.rayAt(point), brush.radius);
      else view.light(view.handleAt(point));
    }
  };

  const up = (event: PointerEvent) => {
    const g = gesture;
    pointers.delete(event.pointerId);
    if (g.kind === 'pinch') {
      if (pointers.size === 0) gesture = { kind: 'none' };
      return;
    }
    if (!('id' in g) || g.id !== event.pointerId) return;
    gesture = { kind: 'none' };
    if (g.kind === 'press' && event.type === 'pointerup' && g.button === 0) {
      wants.choose(view.pick(at(event)), event.shiftKey || event.ctrlKey || event.metaKey || wants.many());
    }
    if (g.kind === 'drag') {
      view.light(null);
      // One drag, one step: written as the pointer lifts. The view keeps the drag's places until the file has them.
      if (event.type === 'pointerup' && g.last && !same(g.last, g.start)) {
        wants.place(new Map(g.last.map((p) => [p.id, { at: p.at, turn: p.turn, scale: p.scale }])), g.label);
      } else view.preview(null);
    }
    if (g.kind === 'orbit' || g.kind === 'pan') stopFlying();
    if (g.kind === 'stroke') {
      // One stroke, one step: written as the pointer lifts, or put back when the browser took the pointer.
      const done = view.terrain.end(event.type === 'pointerup');
      if (done) wants.stroked(done);
      if (event.pointerType !== 'mouse') view.terrain.ring(null, 0);
    }
  };
  const left = () => {
    if (gesture.kind === 'none') view.terrain.ring(null, 0);
  };

  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    camera(zoomedBy(view.orbit(), Math.exp(-event.deltaY * 0.0015)));
  };

  const fly = (last: number) => (now: number) => {
    const way = [...flying].reduce<[number, number, number]>(
      (sum, code) => {
        const step = FLY_KEYS[code];
        return step ? [sum[0] + step[0], sum[1] + step[1], sum[2] + step[2]] : sum;
      },
      [0, 0, 0],
    );
    camera(
      flownBy(view.orbit(), way, FLY_SPEED * Math.min(0.1, (now - last) / 1000) * (flying.has('ShiftLeft') ? 3 : 1)),
    );
    flyClock = flying.size > 0 ? requestAnimationFrame(fly(now)) : null;
  };
  function stopFlying() {
    flying.clear();
    if (flyClock !== null) cancelAnimationFrame(flyClock);
    flyClock = null;
  }
  /** Held with the right button, as other editors do. */
  const rightHeld = () =>
    (gesture.kind === 'press' || gesture.kind === 'pan' || gesture.kind === 'orbit') && gesture.button === 2;

  const keyDown = (event: KeyboardEvent) => {
    if (rightHeld() && (FLY_KEYS[event.code] || event.code === 'ShiftLeft')) {
      event.preventDefault();
      flying.add(event.code);
      if (flyClock === null) flyClock = requestAnimationFrame(fly(performance.now()));
      return;
    }
    const o = view.orbit();
    const keys: Record<string, () => void> = {
      Delete: wants.remove,
      Backspace: wants.remove,
      Escape: () => wants.choose(null, false),
      KeyF: () => view.frame(),
      ArrowLeft: () => camera(turnedBy(o, 50, 0)),
      ArrowRight: () => camera(turnedBy(o, -50, 0)),
      ArrowUp: () => camera(turnedBy(o, 0, 50)),
      ArrowDown: () => camera(turnedBy(o, 0, -50)),
      Equal: () => camera(zoomedBy(o, 1.25)),
      Minus: () => camera(zoomedBy(o, 0.8)),
    };
    const run = keys[event.code];
    if (!run || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    run();
  };
  const keyUp = (event: KeyboardEvent) => {
    flying.delete(event.code);
  };
  const noMenu = (event: Event) => event.preventDefault();

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', left);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('contextmenu', noMenu);
  focusable.addEventListener('keydown', keyDown);
  focusable.addEventListener('keyup', keyUp);
  return () => {
    stopFlying();
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('pointerleave', left);
    canvas.removeEventListener('wheel', wheel);
    canvas.removeEventListener('contextmenu', noMenu);
    focusable.removeEventListener('keydown', keyDown);
    focusable.removeEventListener('keyup', keyUp);
  };
}
