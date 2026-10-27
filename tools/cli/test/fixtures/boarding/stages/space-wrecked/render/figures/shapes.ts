// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// The shapes a figure is dressed in, made in its own frame (u ahead, v to
// its left, w up) and placed by the kit: boxes, rods, plates, tubes, rings,
// turned surfaces, balls and domes. Each face's normal points away from a
// point inside its shape. detail (0 to 1) thins out the round shapes' sides
// for figures drawn small.
import { type Face, normalOf, type Vec3 } from '../solid.ts';

// A figure's colors (figure.js) and the outline round it.
export interface Colors {
  suit: string;
  trim: string;
  dark: string;
  under: string;
  visor: string;
  glass: string;
  lamp: string;
  gun: string;
  outline?: string;
}

export interface Kit {
  faces: Face[];
  place: (p: Vec3) => Vec3;
  colors: Colors;
  girth: number;
  seg: (n: number, least?: number) => number;
}

// A facet's paint: its color and whether it is lit from within.
export type Paint = { color: string; emissive?: boolean };

// place: a point in the figure's frame to the world; girth widens round
// parts for heavier builds.
export function makeKit({ place, colors, detail = 1, girth = 1 }: { place: (p: Vec3) => Vec3; colors: Colors; detail?: number; girth?: number }): Kit {
  return { faces: [], place, colors, girth, seg: (n, least = 5) => Math.max(least, Math.round(n * detail)) };
}

export function emit(kit: Kit, local: Vec3[], inside: Vec3, color: string, emissive = false): void {
  const pts = local.map(kit.place);
  const face: Face = { pts, normal: normalOf(pts, kit.place(inside)), color };
  if (emissive) face.emissive = true;
  kit.faces.push(face);
}

// Six faces from eight corners: 0-3 one end, 4-7 the other, in order.
export function hexa(kit: Kit, c: Vec3[], color: string, emissive?: boolean): void {
  const inside = scale(c.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / 8);
  for (const q of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) emit(kit, q.map((i) => c[i] as Vec3), inside, color, emissive);
}

export function block(kit: Kit, [u0, v0, w0]: Vec3, [u1, v1, w1]: Vec3, color: string, emissive?: boolean): void {
  hexa(kit, [[u0, v0, w0], [u1, v0, w0], [u1, v1, w0], [u0, v1, w0], [u0, v0, w1], [u1, v0, w1], [u1, v1, w1], [u0, v1, w1]], color, emissive);
}

export function cubeAt(kit: Kit, [u, v, w]: Vec3, h: number, color: string, emissive?: boolean): void {
  block(kit, [u - h, v - h, w - h], [u + h, v + h, w + h], color, emissive);
}

// A box from a to b, `across` wide and `high` high (half sizes), its middle
// `lift` of high above the line.
export function slab(kit: Kit, a: Vec3, b: Vec3, across: number, high: number, color: string, lift = 0, emissive?: boolean): void {
  const [side, up] = frame(sub(b, a));
  const corner = (p: Vec3, s: number, t: number) => add(add(p, scale(side, s * across)), scale(up, (t + lift) * high));
  hexa(kit, [corner(a, -1, -1), corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1), corner(b, -1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(b, -1, 1)], color, emissive);
}

// A thin square rod: seams, masts, struts.
export function rod(kit: Kit, a: Vec3, b: Vec3, half: number, color: string, emissive?: boolean): void {
  slab(kit, a, b, half, half, color, 0, emissive);
}

// A plate laid along a limb from a to b, wide0 to wide1 across (half
// widths), from `near` to `far` ahead of the bone.
export function plateAlong(kit: Kit, a: Vec3, b: Vec3, wide0: number, wide1: number, near: number, far: number, color: string): void {
  const [side, up] = frame(sub(b, a));
  const ahead = norm(add(scale(up, 0.25), [1, 0, 0]));
  const p = (q: Vec3, s: number, w: number, o: number) => add(add(q, scale(side, s * w)), scale(ahead, o));
  hexa(kit, [p(a, -1, wide0, near), p(a, 1, wide0, near), p(a, 1, wide0, far), p(a, -1, wide0, far), p(b, -1, wide1, near), p(b, 1, wide1, near), p(b, 1, wide1, far), p(b, -1, wide1, far)], color);
}

// A tapered tube from a to b, radius ra to rb, its ends capped.
export function tube(kit: Kit, a: Vec3, b: Vec3, ra: number, rb: number, color: string, n = 10, emissive?: boolean): void {
  const sides = kit.seg(n);
  const [side, up] = frame(sub(b, a));
  const ring = (p: Vec3, r: number) => Array.from({ length: sides }, (_, i) => {
    const t = ((i + 0.5) / sides) * Math.PI * 2;
    return add(p, add(scale(side, r * Math.cos(t)), scale(up, r * Math.sin(t))));
  });
  const [r0, r1] = [ring(a, ra), ring(b, rb)];
  const inside = scale(add(a, b), 0.5);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    emit(kit, [r0[i], r0[j], r1[j], r1[i]] as Vec3[], inside, color, emissive);
  }
  emit(kit, r1, a, color, emissive);
  emit(kit, r0, b, color, emissive);
}

// A short ring round a joint at p, along `axis`.
export function band(kit: Kit, p: Vec3, axis: Vec3, r: number, length: number, color: string): void {
  const d = scale(norm(axis), length / 2);
  tube(kit, sub(p, d), add(p, d), r, r, color);
}

// A surface turned round the upright through [u, v]: rings [w, ru, rv] from
// the bottom up, joined, the top closed unless `top` is false. square above
// 2 squares the rings off toward rounded boxes.
export function lathe(kit: Kit, [cu, cv]: number[], rings: Vec3[], n: number, color: string, { top = true, square = 2 }: { top?: boolean; square?: number } = {}): void {
  const sides = kit.seg(n, 6);
  const k = 2 / square;
  const curve = (c: number) => Math.sign(c) * Math.abs(c) ** k;
  const ring = ([w, ru, rv]: Vec3) => Array.from({ length: sides }, (_, i) => {
    const a = ((i + 0.5) / sides) * Math.PI * 2;
    return [cu + ru * curve(Math.cos(a)), cv + rv * curve(Math.sin(a)), w];
  });
  const pts = rings.map(ring);
  for (let r = 0; r < rings.length - 1; r++) {
    const inside = [cu, cv, (rings[r][0] + rings[r + 1][0]) / 2];
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      emit(kit, [pts[r][i], pts[r][j], pts[r + 1][j], pts[r + 1][i]], inside, color);
    }
  }
  if (top) emit(kit, pts.at(-1) as Vec3[], [cu, cv, rings[0][0]], color);
}

// The fewest sides and rings a helmet is drawn with, however small: its
// visor and trim are painted by rings, which seven still show.
export const HELMET = [10, 7];

// An ellipsoid round c, radii [ahead, across, up]; paint(lat, lon) gives
// each facet's { color, emissive } (lon 0 is straight ahead, a facet's
// middle). least: the fewest [sides, rings] when drawn small.
export function ball(kit: Kit, c: Vec3, [ru, rv, rw]: Vec3, paint: (lat: number, lon: number) => Paint, n = 10, m = 6, least = [5, 3]): void {
  const [cols, rows] = [kit.seg(n, least[0]), kit.seg(m, least[1])];
  const pt = (i: number, j: number) => {
    const lon = ((i - 0.5) / cols) * Math.PI * 2;
    const lat = -Math.PI / 2 + (j / rows) * Math.PI;
    return add(c, [ru * Math.cos(lat) * Math.cos(lon), rv * Math.cos(lat) * Math.sin(lon), rw * Math.sin(lat)]);
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const quad = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
      const pts = j === 0 ? [quad[0], quad[2], quad[3]] : j === rows - 1 ? [quad[0], quad[1], quad[2]] : quad;
      const { color, emissive } = paint(-Math.PI / 2 + ((j + 0.5) / rows) * Math.PI, (i / cols) * Math.PI * 2);
      emit(kit, pts as Vec3[], c, color, emissive);
    }
  }
}

// The top half of an ellipsoid round c, its top along `axis` (up unless
// given), radii [ahead, across, high], closed underneath; paint(lat) gives
// each ring's { color, emissive }.
export function dome(kit: Kit, c: Vec3, [ra, rb, rh]: Vec3, paint: (lat: number) => Paint, n = 10, m = 3, axis: Vec3 = [0, 0, 1]): void {
  const [cols, rows] = [kit.seg(n, 6), Math.max(2, kit.seg(m, 2))];
  const up = norm(axis);
  const ahead = norm(sub([1, 0, 0], scale(up, up[0])));
  const across = cross(up, ahead);
  const pt = (i: number, j: number) => {
    const lon = ((i - 0.5) / cols) * Math.PI * 2;
    const lat = (j / rows) * (Math.PI / 2);
    return add(c, add(add(scale(ahead, ra * Math.cos(lat) * Math.cos(lon)), scale(across, rb * Math.cos(lat) * Math.sin(lon))), scale(up, rh * Math.sin(lat))));
  };
  const inside = add(c, scale(up, rh * 0.3));
  for (let j = 0; j < rows; j++) {
    const { color, emissive } = paint(((j + 0.5) / rows) * (Math.PI / 2));
    for (let i = 0; i < cols; i++) {
      const quad = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
      emit(kit, j === rows - 1 ? [quad[0], quad[1], quad[2]] as Vec3[] : quad, inside, color, emissive);
    }
  }
  emit(kit, Array.from({ length: cols }, (_, i) => pt(i, 0)), inside, paint(0).color);
}

// A boot at the ankle [u, v]: a sole, and an upper with its toe ahead.
export function boot(kit: Kit, [u, v]: number[], half: number, ahead: number, high: number, color: string, sole: string): void {
  block(kit, [u - 0.055, v - half, 0], [u + ahead, v + half, 0.02], sole);
  hexa(kit, [[u - 0.055, v - half, 0.02], [u + ahead, v - half * 0.85, 0.02], [u + ahead, v + half * 0.85, 0.02], [u - 0.055, v + half, 0.02], [u - 0.05, v - half, high], [u + ahead * 0.4, v - half * 0.9, high], [u + ahead * 0.4, v + half * 0.9, high], [u - 0.05, v + half, high]], color);
}

// A ridge over the top of a helmet round c of radius r, front to back:
// `rise` above the shell at its highest, `sweep` how far back it reaches.
export function ridge(kit: Kit, [cu, , cw]: Vec3, r: number, rise: number, sweep: number, color: string): void {
  const t = 0.007;
  hexa(kit, [[cu - r * 1.05, -t, cw + r * 0.1], [cu - r * 0.05, -t, cw + r * 1.02], [cu - r * 0.05, t, cw + r * 1.02], [cu - r * 1.05, t, cw + r * 0.1], [cu - r * (1.05 + sweep), -t, cw + r * (0.1 + rise)], [cu - r * (0.05 + sweep), -t, cw + r * (1.02 + rise)], [cu - r * (0.05 + sweep), t, cw + r * (1.02 + rise)], [cu - r * (1.05 + sweep), t, cw + r * (0.1 + rise)]], color);
}

// Two directions square to `axis` and to each other: across it (level) and
// up from it.
export function frame(axis: Vec3): [Vec3, Vec3] {
  const a = norm(axis);
  let side = cross(a, [0, 0, 1]);
  if (Math.hypot(...side) < 1e-6) side = [0, 1, 0];
  side = norm(side);
  return [side, cross(side, a)];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return add(a, scale(sub(b, a), t));
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function norm(a: Vec3): Vec3 {
  return scale(a, 1 / (Math.hypot(...a) || 1));
}
