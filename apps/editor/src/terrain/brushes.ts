/**
 * The terrain's brushes (M5.3, D65, docs/specs/terrain.md#brushes): each dab acts in a circle around
 * a point, its effect falling off as (1 − (d / r)²)², and dabs fall every half spacing the pointer
 * moves over the ground, so a stroke's result is its path's, not its speed's. Each changes the grid
 * in place and says which vertices it touched, for the chunks to redraw. Plant and Clear (M5.6,
 * D68) add and take a foliage type's density, which no other channel shares.
 */
import { cellOf, type TerrainGrid } from './grid.ts';

export type BrushKind = 'raise' | 'lower' | 'smooth' | 'flatten' | 'paint' | 'plant' | 'clear';

export interface Brush {
  readonly kind: BrushKind;
  /** Metres, 0.5 to 64. */
  readonly radius: number;
  /** 0.05 to 1. */
  readonly strength: number;
  /** The layer Paint adds to, 0 to 3. */
  readonly layer: number;
  /** The foliage type Plant and Clear act on, 0 to 3. */
  readonly foliage: number;
}

/** Vertices a dab touched, inclusive. */
export interface Area {
  readonly i0: number;
  readonly i1: number;
  readonly j0: number;
  readonly j1: number;
}

/** How far a dab of Raise or Lower moves a height at the brush's middle, at strength 1. */
export const RAISE_STEP = 0.25;

const falloff = (d: number, r: number) => {
  const t = 1 - (d * d) / (r * r);
  return t > 0 ? t * t : 0;
};

/** The vertices within `radius` metres of (x, z), held to the grid, or null when none are. */
export function areaOf(g: TerrainGrid, x: number, z: number, radius: number): Area | null {
  const [fi, fj] = cellOf(g, x, z);
  const reach = radius / g.spacing;
  const i0 = Math.max(0, Math.ceil(fi - reach));
  const i1 = Math.min(g.size - 1, Math.floor(fi + reach));
  const j0 = Math.max(0, Math.ceil(fj - reach));
  const j1 = Math.min(g.size - 1, Math.floor(fj + reach));
  return i0 > i1 || j0 > j1 ? null : { i0, i1, j0, j1 };
}

/** One dab at (x, z): Flatten moves heights towards `target`, the height under its stroke's first dab. */
export function dab(g: TerrainGrid, x: number, z: number, brush: Brush, target = 0): Area | null {
  const area = areaOf(g, x, z, brush.radius);
  if (!area) return null;
  const [fi, fj] = cellOf(g, x, z);
  // Smooth reads its neighbours as they were before the dab, so the order vertices are visited in doesn't matter.
  const before = brush.kind === 'smooth' ? snapshot(g, area) : null;
  for (let j = area.j0; j <= area.j1; j++) {
    for (let i = area.i0; i <= area.i1; i++) {
      const f = falloff(Math.hypot(i - fi, j - fj) * g.spacing, brush.radius) * brush.strength;
      if (f <= 0) continue;
      const v = j * g.size + i;
      if (brush.kind === 'paint') {
        paintVertex(g.paint, v * 4, brush.layer, f * 255);
        continue;
      }
      if (brush.kind === 'plant' || brush.kind === 'clear') {
        const at = v * 4 + brush.foliage;
        const next = (g.foliage[at] as number) + (brush.kind === 'plant' ? f : -f) * 255;
        g.foliage[at] = Math.min(255, Math.max(0, Math.round(next)));
        continue;
      }
      const h = g.heights[v] as number;
      let next = h;
      if (brush.kind === 'raise') next = h + RAISE_STEP * f;
      else if (brush.kind === 'lower') next = h - RAISE_STEP * f;
      else if (brush.kind === 'flatten') next = h + (target - h) * f;
      else if (before) next = h + (before.mean(i, j) - h) * f;
      g.heights[v] = Math.min(g.high, Math.max(g.low, next));
    }
  }
  return area;
}

/**
 * The heights of `area` and a vertex around it, copied before a dab changes them, and the mean of a
 * vertex and its eight neighbours there, those off the grid left out. Only the area is copied: a
 * stroke dabs every half spacing, and a whole 513² copy each time would be 1 MB.
 */
function snapshot(g: TerrainGrid, area: Area): { mean(i: number, j: number): number } {
  const i0 = Math.max(0, area.i0 - 1);
  const j0 = Math.max(0, area.j0 - 1);
  const i1 = Math.min(g.size - 1, area.i1 + 1);
  const j1 = Math.min(g.size - 1, area.j1 + 1);
  const width = i1 - i0 + 1;
  const copy = new Float32Array(width * (j1 - j0 + 1));
  for (let j = j0; j <= j1; j++) copy.set(g.heights.subarray(j * g.size + i0, j * g.size + i1 + 1), (j - j0) * width);
  return {
    mean(i, j) {
      let sum = 0;
      let n = 0;
      for (let b = Math.max(j0, j - 1); b <= Math.min(j1, j + 1); b++) {
        for (let a = Math.max(i0, i - 1); a <= Math.min(i1, i + 1); a++) {
          sum += copy[(b - j0) * width + (a - i0)] as number;
          n++;
        }
      }
      return sum / n;
    },
  };
}

/**
 * `add` more of `layer` at the vertex whose weights start at `at`, taken from the others in
 * proportion, so the four still sum to 255; weights that summed to 0 count as all of layer 1.
 */
export function paintVertex(paint: Uint8Array, at: number, layer: number, add: number): void {
  const w = [0, 1, 2, 3].map((k) => paint[at + k] as number);
  if (w.reduce((s, v) => s + v, 0) === 0) w[0] = 255;
  const total = w.reduce((s, v) => s + v, 0);
  const mine = Math.min(255, ((w[layer] as number) * 255) / total + add);
  const others = w.reduce((s, v, k) => (k === layer ? s : s + v), 0);
  const left = 255 - mine;
  let given = 0;
  for (let k = 0; k < 4; k++) {
    if (k === layer) continue;
    const share = others > 0 ? Math.floor(((w[k] as number) * left) / others) : 0;
    paint[at + k] = share;
    given += share;
  }
  paint[at + layer] = 255 - given;
}

/** Where along a stroke's last move the next dabs fall: every `step` metres, the distance since the last carried over. */
export function dabsAlong(
  from: readonly [number, number],
  to: readonly [number, number],
  step: number,
  carried: number,
): { points: [number, number][]; carried: number } {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const points: [number, number][] = [];
  let at = step - carried;
  while (at <= length) {
    const t = length === 0 ? 0 : at / length;
    points.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    at += step;
  }
  return { points, carried: length - (at - step) };
}

/** The smallest area holding both. */
export const unionOf = (a: Area | null, b: Area | null): Area | null =>
  !a
    ? b
    : !b
      ? a
      : {
          i0: Math.min(a.i0, b.i0),
          i1: Math.max(a.i1, b.i1),
          j0: Math.min(a.j0, b.j0),
          j1: Math.max(a.j1, b.j1),
        };
