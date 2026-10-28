// The board's camera (M7.4, D86): Space-Wrecked's orbit camera, opened as its fight view opens
// one (src/ui/fight/view.js refit: FIGHT_VIEW fitted to the ship, zoom held between its limits,
// the map kept in view), turned by the frame's input. Space-Wrecked pans with one finger and
// never tilts; here a drag turns and tilts the board, as the stage's spec asks, and the pitch's
// limits are this stage's own.
import type { Frame, StageInput } from 'eb/stage';
import { FIGHT_VIEW } from '../space-wrecked/render/battle-view.ts';
import {
  type Box,
  type Cam,
  clampOrbit,
  fitOrbit,
  type Limits,
  project,
  type Rect,
  turnOrbit,
  unproject,
  zoomOrbit,
} from '../space-wrecked/render/orbit.ts';

// Space-Wrecked's fight view's.
const MARGIN = 14; // pixels around the ship when the view is fitted
const MAX_ZOOM = 3; // times the fitted scale
const MIN_ZOOM = 0.6; // times the fitted scale, or of the whole map's if that is further out
const TURN_SLOP = 0.17; // radians of twist before a pinch turns the map
const KEY_TURN = Math.PI / 12; // Q and E on a keyboard there; the arrows here
const WHEEL_ZOOM = 0.0015; // the wheel's zoom, as exp(-dy × this)

// This stage's own.
const deg = Math.PI / 180;
const TURN_PER_PX = 0.01; // a drag across a phone turns the board about half round
const TILT_PER_PX = 0.005;
const KEY_TILT = 5 * deg;
const KEY_ZOOM = 1.25;
const PITCH: readonly [number, number] = [35 * deg, 88 * deg]; // from low over the deck to straight down
const GESTURE_GAP_S = 0.25; // a twist this long after the last is a new gesture, its slop counted again

export interface BoardCamera {
  /** The camera after the frame's input, and the box it fills. */
  frame(f: Pick<Frame, 't' | 'w' | 'h' | 'input'>): { cam: Cam; rect: Rect };
}

export function createCamera(boxes: { fit: Box; all: Box }): BoardCamera {
  let rect: Rect | undefined;
  let cam: Cam | undefined;
  let limits: Limits = { min: 0, max: Infinity };
  // A twist so far, and how much of it has turned the board.
  let twisted = 0;
  let turned = 0;
  let twistAt = -Infinity;

  // Opens the view on the ship as large as fits, at the yaw and pitch it had if it had one.
  const refit = (r: Rect) => {
    const view = { ...FIGHT_VIEW, yaw: cam?.yaw ?? FIGHT_VIEW.yaw, pitch: cam?.pitch ?? FIGHT_VIEW.pitch };
    const fit = clampOrbit(fitOrbit({ ...view, pivot: middle(boxes.fit) }, r, boxes.fit, MARGIN), r, boxes.all, MARGIN);
    const whole = fitOrbit({ ...view, pivot: middle(boxes.all) }, r, boxes.all, MARGIN);
    limits = { min: Math.min(fit.scale, whole.scale) * MIN_ZOOM, max: fit.scale * MAX_ZOOM };
    return fit;
  };
  const keep = (next: Cam, r: Rect) => clampOrbit(next, r, boxes.all, MARGIN);

  const apply = (c: Cam, r: Rect, e: StageInput, t: number): Cam => {
    const [cx, cy] = [r.x + r.w / 2, r.y + r.h / 2];
    if (e.kind === 'drag')
      return tilt(turnOrbit(c, cx, cy, c.yaw + e.dx * TURN_PER_PX), cx, cy, c.pitch + e.dy * TILT_PER_PX);
    if (e.kind === 'wheel') return zoomOrbit(c, cx, cy, c.scale * Math.exp(-e.dy * WHEEL_ZOOM), limits);
    if (e.kind === 'twist') {
      if (t - twistAt > GESTURE_GAP_S) twisted = turned = 0;
      twistAt = t;
      // orbit.js's twist, less its wrap: this angle is summed, not read off two fingers.
      twisted += e.angle;
      const due = Math.abs(twisted) <= TURN_SLOP ? 0 : twisted - Math.sign(twisted) * TURN_SLOP;
      const next = turnOrbit(c, cx, cy, c.yaw + due - turned);
      turned = due;
      return zoomOrbit(next, cx, cy, next.scale * e.scale, limits);
    }
    if (e.kind !== 'key' || !e.down) return c;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      return turnOrbit(c, cx, cy, c.yaw + (e.key === 'ArrowLeft' ? -KEY_TURN : KEY_TURN));
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown')
      return tilt(c, cx, cy, c.pitch + (e.key === 'ArrowUp' ? -KEY_TILT : KEY_TILT));
    if (e.key === '+' || e.key === '-')
      return zoomOrbit(c, cx, cy, c.scale * (e.key === '+' ? KEY_ZOOM : 1 / KEY_ZOOM), limits);
    return c;
  };

  return {
    frame(f) {
      if (!rect || !cam || rect.w !== f.w || rect.h !== f.h) {
        rect = { x: 0, y: 0, w: f.w, h: f.h };
        cam = refit(rect);
      }
      // The same camera while nothing moves it, so the board reuses its last full frame.
      for (const e of f.input) {
        const next = apply(cam, rect, e, f.t);
        if (next !== cam) cam = keep(next, rect);
      }
      return { cam, rect };
    },
  };
}

// Tilts the board to `pitch`, within its limits, about the deck point under (sx, sy), as
// orbit.js's turnOrbit turns it.
function tilt(cam: Cam, sx: number, sy: number, pitch: number): Cam {
  const at = unproject(cam, sx, sy) ?? cam.pivot;
  const next = { ...cam, pitch: Math.max(PITCH[0], Math.min(PITCH[1], pitch)) };
  const [px, py] = project(next, at[0], at[1], 0);
  return { ...next, x: next.x + sx - px, y: next.y + sy - py };
}

function middle(box: Box): [number, number] {
  return [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
}
