// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// Figures drawn once and kept. A figure is hundreds of faces, too many to
// paint every frame, so each is painted into a small canvas of its own the
// first time it is seen at a given angle, in a given pose and at a given
// size, and that canvas is drawn from then on. The painter places it among
// the map's faces (painter.js items), so a wall in front still hides it.
//
// Perspective sees each figure along its own ray from the camera, so a
// kept drawing is made along that ray (its own yaw and pitch, which differ
// across the screen), then turned to the way up looks where it stands and
// scaled to the size the camera makes it there. Angles, sizes and poses are
// rounded to steps: a figure standing still is drawn once, and a few
// hundred drawings cover a fight. These are drawings made by our renderer
// at run time, not image files.
//
//   sprites = createFigureSprites({ bytes, budget, now, makeCanvas })
//   sprites.frame()            before each frame
//   sprites.item(figure, ratio)  for paintSolid's items. figure: { id, at:
//                              [x, y], facing, look, held, colors, pose,
//                              key }, key a string that stands for its look,
//                              held shape and colors; ratio the device
//                              pixels per CSS pixel to draw it at
//   sprites.stale()            true if a figure was shown from an older
//                              drawing this frame (misses past `budget` ms
//                              wait for a later frame), so draw again soon
//   sprites.size()             the drawings kept: the oldest go once they
//                              take more than `bytes`
import { STILL_CLOCK } from '../frame-budget.ts';
import { type Cam, eyeOf, project } from '../orbit.ts';
import { type Item, paintSolid, prepareSolid } from '../painter.ts';
import { palette } from '../palette.ts';
import { type Face, shade, type Vec3 } from '../solid.ts';
import { anchorOf, figureFaces, type Pose } from './figure.ts';
import type { Held, Look } from './looks.ts';
import type { Colors } from './shapes.ts';

export interface Figure {
  id: string;
  at: number[];
  facing: number[];
  look?: Look;
  held?: Held;
  colors: Colors;
  pose: Pose;
  key: string;
}

interface View {
  yaw: number;
  pitch: number;
  facing: number;
  k: number;
  key: string;
}

interface Sprite {
  canvas: OffscreenCanvas;
  ax: number;
  ay: number;
  w: number;
  h: number;
  k: number;
  bytes: number;
}

type Stepped = { aim: number; stride: number | null; fall: number };
type MakeCanvas = (w: number, h: number) => OffscreenCanvas;

const YAW = (Math.PI * 2) / 64; // steps of the camera's angle round a figure
const PITCH = Math.PI / 48; // and above it (3.75°)
const FACING = (Math.PI * 2) / 64; // of the way a figure faces
const SIZE = Math.log(1.08); // of its size on screen, 8% apart
const PAD = 3; // CSS px round a drawing, for its outline
const OUTLINE = 1.1; // CSS px: how far the outline reaches out round a figure
const SHARP = 160; // device px per cell from which figures get their finest detail
const DISTANCE = 40; // the drawing camera's distance: the fight camera's

// now: the clock the drawing budget is spent by. A stage may read none, so
// by default it stands still and every figure is drawn when first needed.
export function createFigureSprites({ bytes = 24e6, budget = 2, now = STILL_CLOCK, makeCanvas = defaultCanvas }: { bytes?: number; budget?: number; now?: () => number; makeCanvas?: MakeCanvas } = {}) {
  const kept = new Map<string, Sprite>(); // key -> drawing, oldest first
  const last = new Map<string, Sprite>(); // figure id -> the drawing it last showed
  let held = 0; // bytes the kept drawings take
  let spent = 0;
  let behind = false;
  const scratch: { canvas: OffscreenCanvas | null } = { canvas: null }; // where a figure is painted before its outline
  return {
    frame() {
      spent = 0;
      behind = false;
    },
    item(figure: Figure, ratio: number): Item {
      const at = anchorOf(figure.at, figure.pose?.fall ?? 0);
      return { at, draw: (ctx, cam) => draw(ctx, cam, figure, at, ratio) };
    },
    stale: () => behind,
    size: () => kept.size,
  };

  function draw(ctx: OffscreenCanvasRenderingContext2D, cam: Cam, figure: Figure, at: Vec3, ratio: number): void {
    const [sx, sy, depth] = project(cam, at[0], at[1], at[2]);
    if (depth <= 0) return;
    const k = (cam.scale * cam.distance) / depth;
    const view = viewOf(cam, at, figure.facing, k);
    const pose = steppedPose(figure.pose);
    const key = `${figure.key}|${poseKey(pose)}|${view.key}|${ratio}`;
    let sprite = kept.get(key);
    if (sprite) {
      kept.delete(key);
      kept.set(key, sprite);
    } else if (spent < budget || !last.has(figure.id)) {
      const start = now();
      sprite = paintFigure(figure, pose, view, ratio, makeCanvas, scratch);
      spent += now() - start;
      kept.set(key, sprite);
      held += sprite.bytes;
      while (held > bytes && kept.size > 1) {
        const [oldest, gone] = kept.entries().next().value as [string, Sprite];
        kept.delete(oldest);
        held -= gone.bytes;
      }
    } else {
      sprite = last.get(figure.id) as Sprite;
      behind = true;
    }
    last.set(figure.id, sprite);
    // Up on screen where the figure stands: perspective leans it outward
    // toward the sides.
    const [ux, uy] = project(cam, at[0], at[1], at[2] + 0.1);
    const s = k / sprite.k;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.atan2(ux - sx, sy - uy));
    ctx.scale(s, s);
    ctx.drawImage(sprite.canvas, -sprite.ax, -sprite.ay, sprite.w, sprite.h);
    ctx.restore();
  }
}

// The angle a figure at `at` is seen from, its facing and its size (px per
// cell), each rounded to its step.
export function viewOf(cam: Cam, at: Vec3, [fx, fy]: number[], k: number): View {
  const eye = eyeOf(cam);
  const [dx, dy, dz] = [eye[0] - at[0], eye[1] - at[1], eye[2] - at[2]];
  const steps = [
    Math.round(Math.atan2(dx, dy) / YAW),
    Math.round(Math.atan2(dz, Math.hypot(dx, dy)) / PITCH),
    Math.round(Math.atan2(fy, fx) / FACING),
    Math.round(Math.log(k) / SIZE),
  ];
  return { yaw: steps[0] * YAW, pitch: steps[1] * PITCH, facing: steps[2] * FACING, k: Math.exp(steps[3] * SIZE), key: steps.join(',') };
}

// A pose rounded to the steps it is drawn in: aim in quarters, the walk in
// eighths of a stride, a fall in tenths.
export function steppedPose({ aim = 0, stride = null, fall = 0 }: Pose = {}): Stepped {
  return {
    aim: Math.round(aim * 4) / 4,
    stride: stride == null ? null : (Math.round((((stride % 1) + 1) % 1) * 8) % 8) / 8,
    fall: Math.round(fall * 10) / 10,
  };
}

function poseKey({ aim, stride, fall }: Stepped): string {
  return `${aim},${stride ?? '-'},${fall}`;
}

// Paints a figure seen as `view` says into a canvas of its own: { canvas,
// ax, ay (its anchor, CSS px), w, h (CSS px), k, bytes }. The figure is
// painted first into `scratch`, then copied a little out all round and
// tinted for its outline, and laid over that: an outline for a few copies,
// where stroking its faces would cost several times the painting.
function paintFigure(figure: Figure, pose: Stepped, view: View, ratio: number, makeCanvas: MakeCanvas, scratch: { canvas: OffscreenCanvas | null }): Sprite {
  const faces: Face[] = [];
  const facing = [Math.cos(view.facing), Math.sin(view.facing)];
  const detail = view.k * ratio >= SHARP ? 1 : 0.6;
  figureFaces(faces, { at: [0, 0], facing }, figure.look, figure.held, figure.colors, pose, detail);
  const at = anchorOf([0, 0], pose.fall);
  const cam: Cam = { yaw: view.yaw, pitch: view.pitch, distance: DISTANCE, pivot: [0, 0], scale: 1, x: 0, y: 0 };
  // The scale that makes the anchor view.k px per cell.
  cam.scale = (view.k * project(cam, at[0], at[1], at[2])[2]) / DISTANCE;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const face of faces) {
    for (const p of face.pts) {
      const [x, y] = project(cam, p[0], p[1], p[2]);
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  }
  const [w, h] = [Math.ceil((x1 - x0 + 2 * PAD) * ratio), Math.ceil((y1 - y0 + 2 * PAD) * ratio)];
  const placed = { ...cam, x: PAD - x0, y: PAD - y0 };
  if (!scratch.canvas || scratch.canvas.width < w || scratch.canvas.height < h) {
    scratch.canvas = makeCanvas(Math.max(w, scratch.canvas?.width ?? 0), Math.max(h, scratch.canvas?.height ?? 0));
  }
  const flat = scratch.canvas;
  const f = flat.getContext('2d') as OffscreenCanvasRenderingContext2D;
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.clearRect(0, 0, w, h);
  f.setTransform(ratio, 0, 0, ratio, 0, 0);
  paintSolid(f, prepareSolid(faces, shade), [], placed, { edges: false });
  const canvas = makeCanvas(w, h);
  const g = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  const r = OUTLINE * ratio;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.drawImage(flat, 0, 0, w, h, r * Math.cos(a), r * Math.sin(a), w, h);
  }
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = figure.colors.outline ?? palette.figureEdge;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  g.drawImage(flat, 0, 0, w, h, 0, 0, w, h);
  const [ax, ay] = project(placed, at[0], at[1], at[2]);
  return { canvas, ax, ay, w: w / ratio, h: h / ratio, k: view.k, bytes: w * h * 4 };
}

// A stage draws in a worker, which has no document: its canvases are
// OffscreenCanvases.
function defaultCanvas(w: number, h: number): OffscreenCanvas {
  return new OffscreenCanvas(w, h);
}
