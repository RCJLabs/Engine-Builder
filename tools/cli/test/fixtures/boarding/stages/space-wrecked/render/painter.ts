// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// Draws models (mesh.js) on a 2D canvas through an orbit camera (orbit.js).
// Blueprint scenes are see-through, so nothing is depth-sorted: each style
// is one batch, filled and stroked once, in a fixed order, which keeps a
// frame to a few dozen draw calls. Faces are wound the same way on screen
// before they're batched, so where two overlap they fill once instead of
// cancelling out.
//
// The board draws only solid faces, sorted back to front: the blueprint's
// batches (batchModel, paintBatches) and the builder's callouts
// (paintLabels) stay behind with the builder.
import { type Cam, eyeOf } from './orbit.ts';
import { rgba } from './palette.ts';
import type { Face, Vec3 } from './solid.ts';

// A soft round light, r in cells.
export interface Glow {
  at: Vec3;
  r: number;
  color: string;
}

// A face lit and ready to draw (prepareSolid).
export interface Solid {
  pts: Vec3[];
  normal: Vec3;
  mid: Vec3;
  at: Vec3;
  fill: string;
  edge: string | null;
  grow: boolean;
  bias: number;
}

// Something drawn whole at its point among the faces: a figure.
export interface Item {
  at: Vec3;
  draw(ctx: OffscreenCanvasRenderingContext2D, cam: Cam): void;
}

type Projector = (p: Vec3) => number[];

// A function from a world point to [sx, sy, depth] for this camera (the
// same as orbit.js's project, with the camera's sines worked out once). It
// returns one shared array, so read it before the next call.
function projector(cam: Cam): Projector {
  const [ox, oy] = cam.pivot;
  const c = Math.cos(cam.yaw);
  const s = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const f = cam.scale * cam.distance;
  const out = [0, 0, 0];
  return (p) => {
    const dx = p[0] - ox;
    const dy = p[1] - oy;
    const toward = dx * s + dy * c;
    const depth = cam.distance - toward * cp - p[2] * sp;
    const k = f / depth;
    out[0] = cam.x + (dx * c - dy * s) * k;
    out[1] = cam.y - (p[2] * cp - toward * sp) * k;
    out[2] = depth;
    return out;
  };
}

// Soft lights, added on top of what is under them.
function paintGlows(ctx: OffscreenCanvasRenderingContext2D, glows: Glow[], project: Projector, cam: Cam): void {
  if (!glows.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const g of glows) {
    const [x, y, depth] = project(g.at);
    const r = (g.r * cam.scale * cam.distance) / depth;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, rgba(g.color, 0.55));
    gradient.addColorStop(1, rgba(g.color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Solid faces (solid.js), lit and ready to draw: made once per scene.
// Each keeps its fill, its middle (for sorting and facing) and its bias. A
// face whose edge is 'fill' (a piece of a curved surface) has no outline:
// it is drawn grown by half a pixel instead, which hides the seams between
// the pieces as an outline in its own color would, for less than a stroke
// costs.
export function prepareSolid(faces: Face[], shadeFace: (face: Face) => string): Solid[] {
  return faces.map((face) => {
    const n = face.pts.length;
    const mid = [0, 0, 0];
    for (const p of face.pts) for (let k = 0; k < 3; k++) mid[k] += p[k] / n;
    const grow = face.edge === 'fill';
    return { pts: face.pts, normal: face.normal, mid, at: face.sortAt ?? mid, fill: shadeFace(face), edge: grow ? null : face.edge ?? null, grow, bias: face.bias ?? 0 };
  });
}

// Draws solid faces back to front, leaving out those that face away from
// the camera, then glows. Without a depth buffer this is the painter's
// algorithm: right for the ship's simple shapes, which don't pass through
// each other. With edges false, outlines are left out: a quicker frame,
// for while the camera moves. items are drawn in the same order, each as a
// whole at its point: [{ at: [x, y, z], draw(ctx, cam) }] (figures, drawn
// once and kept, figures/sprites.js).
export function paintSolid(ctx: OffscreenCanvasRenderingContext2D, faces: Solid[], glows: Glow[], cam: Cam, { edges = true, items = [] }: { edges?: boolean; items?: Item[] } = {}): void {
  const project = projector(cam);
  const zoom = Math.max(0.85, Math.min(1.6, cam.scale / 60));
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.9 * zoom;
  for (const { face, item } of drawOrder(faces, cam, items)) {
    if (item) {
      item.draw(ctx, cam);
      continue;
    }
    if (!face) continue;
    ctx.beginPath();
    if (face.grow) {
      pathGrown(ctx, face.pts, project, 0.5);
    } else {
      for (let i = 0; i < face.pts.length; i++) {
        const q = project(face.pts[i] as Vec3);
        if (i === 0) ctx.moveTo(q[0], q[1]);
        else ctx.lineTo(q[0], q[1]);
      }
    }
    ctx.closePath();
    ctx.fillStyle = face.fill;
    ctx.fill();
    if (edges && face.edge) {
      ctx.strokeStyle = face.edge;
      ctx.stroke();
    }
  }
  paintGlows(ctx, glows, project, cam);
}

// Traces a face's outline on the screen moved out by `by` pixels at every
// side, its corners mitred (a sharp one no further out than 3 × by). Sides
// of no length are passed over, and a face seen edge on is traced as it
// is. Works in buffers kept from frame to frame, so a frame of curved
// pieces makes no garbage.
const SCREEN = { x: new Float64Array(32), y: new Float64Array(32), nx: new Float64Array(32), ny: new Float64Array(32) };
function pathGrown(ctx: OffscreenCanvasRenderingContext2D, pts: Vec3[], project: Projector, by: number): void {
  const n = pts.length;
  if (n > SCREEN.x.length) for (const key of Object.keys(SCREEN) as (keyof typeof SCREEN)[]) SCREEN[key] = new Float64Array(n * 2);
  const { x, y, nx, ny } = SCREEN;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const q = project(pts[i] as Vec3);
    x[i] = q[0];
    y[i] = q[1];
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += x[i] * y[j] - x[j] * y[i];
  }
  if (Math.abs(area) < 1e-6) {
    for (let i = 0; i < n; i++) ctx.lineTo(x[i], y[i]);
    return;
  }
  // Each side's outward normal; NaN for a side of no length.
  const sign = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = x[j] - x[i];
    const dy = y[j] - y[i];
    const length = Math.hypot(dx, dy);
    nx[i] = length < 1e-6 ? NaN : (sign * dy) / length;
    ny[i] = length < 1e-6 ? NaN : (-sign * dx) / length;
  }
  for (let i = 0; i < n; i++) {
    let before = -1;
    let after = -1;
    for (let k = 1; k <= n && before < 0; k++) if (!Number.isNaN(nx[(i - k + n) % n])) before = (i - k + n) % n;
    for (let k = 0; k < n && after < 0; k++) if (!Number.isNaN(nx[(i + k) % n])) after = (i + k) % n;
    if (before < 0 || after < 0) {
      ctx.lineTo(x[i], y[i]);
      continue;
    }
    const scale = by / Math.max(1 + nx[before] * nx[after] + ny[before] * ny[after], 2 / 9);
    ctx.lineTo(x[i] + (nx[before] + nx[after]) * scale, y[i] + (ny[before] + ny[after]) * scale);
  }
}

// The faces that face the camera, and the items, back to front: [{ face }
// or { item }].
export function drawOrder(faces: Solid[], cam: Cam, items: Item[] = []): { face?: Solid; item?: Item; depth: number }[] {
  const project = projector(cam);
  const eye = eyeOf(cam);
  const shown: { face?: Solid; item?: Item; depth: number }[] = [];
  for (const face of faces) {
    const [mx, my, mz] = face.mid;
    const [nx, ny, nz] = face.normal;
    if ((eye[0] - mx) * nx + (eye[1] - my) * ny + (eye[2] - mz) * nz <= 0) continue;
    shown.push({ face, depth: (project(face.at)[2] as number) + face.bias });
  }
  for (const item of items) shown.push({ item, depth: project(item.at)[2] as number });
  return shown.sort((a, b) => b.depth - a.depth);
}
