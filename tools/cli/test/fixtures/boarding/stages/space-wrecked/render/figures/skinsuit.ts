// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// The skinsuit (looks.js): close-fitting in slate, with lines of light in
// the trim down the limbs and chest, plates in the suit's color over it, and
// a smooth egg of a helmet whose visor wraps round. With plates, the
// shoulders are capped in the trim.
import type { Vec3 } from '../solid.ts';
import type { Skeleton } from './bones.ts';
import type { Look } from './looks.ts';
import { add, ball, dome, HELMET, hexa, type Kit, lathe, mix, plateAlong, ridge, rod, scale, tube } from './shapes.ts';

export function dressSkinsuit(kit: Kit, s: Skeleton, look: Look): void {
  const { suit, trim, under } = kit.colors;
  const { hip, shoulder, girth: g, width: wv } = s.b;
  const seam = (a: Vec3, c: Vec3, r0: number, r1: number) => {
    const out = [0, Math.sign(a[1]) || 1, 0];
    rod(kit, add(a, scale(out, r0)), add(c, scale(out, r1)), 0.008, trim, true);
  };
  for (let i = 0; i < 2; i++) {
    tube(kit, s.hips[i], s.knees[i], 0.042 * g, 0.033 * g, under, 8);
    tube(kit, s.knees[i], s.feet[i], 0.033 * g, 0.027 * g, under, 8);
    plateAlong(kit, mix(s.hips[i], s.knees[i], 0.12), mix(s.hips[i], s.knees[i], 0.8), 0.036 * g, 0.03 * g, 0, 0.048 * g, suit);
    plateAlong(kit, mix(s.knees[i], s.feet[i], 0.1), mix(s.knees[i], s.feet[i], 0.55), 0.03 * g, 0.026 * g, 0, 0.04 * g, suit);
    seam(s.hips[i], s.knees[i], 0.04 * g, 0.032 * g);
    seam(s.knees[i], add(s.feet[i], [0, 0, 0.03]), 0.032 * g, 0.027 * g);
    bootOf(kit, s.feet[i], g);
  }
  const ring = (w: number, ru: number, rv: number): Vec3 => [w, ru * g, rv * wv];
  lathe(kit, [0, 0], [ring(hip - 0.035, 0.06, 0.072), ring(hip + 0.06, 0.056, 0.068), ring(shoulder - 0.07, 0.07, 0.1), ring(shoulder - 0.005, 0.06, 0.1), ring(shoulder + 0.035, 0.035, 0.05)], 12, under, { square: 2.4 });
  // The chest plate with a V of light down it, the belt.
  lathe(kit, [0.012, 0], [ring(shoulder - 0.11, 0.065, 0.088), ring(shoulder - 0.06, 0.07, 0.1), ring(shoulder - 0.01, 0.062, 0.1), ring(shoulder + 0.02, 0.045, 0.07)], 12, suit, { square: 2.4 });
  for (const side of [-1, 1]) rod(kit, [0.07 * g, side * 0.075 * wv, shoulder - 0.03], [0.068 * g, 0, hip + 0.06], 0.008, trim, true);
  lathe(kit, [0, 0], [ring(hip - 0.01, 0.063, 0.074), ring(hip + 0.02, 0.062, 0.073)], 12, suit, { top: false, square: 2.4 });
  back(kit, s, look.back);
  for (let i = 0; i < 2; i++) {
    const out = Math.sign(s.shoulders[i][1]);
    if (look.marks === 'plates') dome(kit, add(s.shoulders[i], [0, out * 0.008, 0]), [0.066 * g, 0.06 * g, 0.044 * g], () => ({ color: trim }), 10, 3, [0, out * 0.75, 1]);
    else dome(kit, s.shoulders[i], [0.05 * g, 0.046 * g, 0.034 * g], () => ({ color: suit }), 8, 3, [0, out * 0.8, 1]);
    tube(kit, s.shoulders[i], s.elbows[i], 0.032 * g, 0.027 * g, under, 8);
    tube(kit, s.elbows[i], s.hands[i], 0.027 * g, 0.023 * g, under, 8);
    plateAlong(kit, mix(s.elbows[i], s.hands[i], 0.15), mix(s.elbows[i], s.hands[i], 0.75), 0.028 * g, 0.03 * g, -0.005, 0.034 * g, suit);
    seam(s.shoulders[i], s.elbows[i], 0.03 * g, 0.026 * g);
    ball(kit, s.hands[i], [0.027 * g, 0.027 * g, 0.027 * g], () => ({ color: suit }), 6, 4);
  }
  helmet(kit, s, look.helmet);
}

// A boot in the suit's color on a slate sole.
function bootOf(kit: Kit, [u, v]: Vec3, g: number): void {
  const { suit, under } = kit.colors;
  const half = 0.034 * g;
  hexa(kit, [[u - 0.05, v - half, 0], [u + 0.075, v - half * 0.8, 0], [u + 0.075, v + half * 0.8, 0], [u - 0.05, v + half, 0], [u - 0.05, v - half, 0.02], [u + 0.075, v - half * 0.8, 0.02], [u + 0.075, v + half * 0.8, 0.02], [u - 0.05, v + half, 0.02]], under);
  hexa(kit, [[u - 0.05, v - half, 0.02], [u + 0.075, v - half * 0.8, 0.02], [u + 0.075, v + half * 0.8, 0.02], [u - 0.05, v + half, 0.02], [u - 0.045, v - half, 0.075], [u + 0.03, v - half * 0.85, 0.075], [u + 0.03, v + half * 0.85, 0.075], [u - 0.045, v + half, 0.075]], suit);
}

// On the back: a slim pack along the spine with two lights (spine), a jump
// pack with its nozzles lit (jump), or nothing.
function back(kit: Kit, s: Skeleton, kind: string): void {
  const { suit, trim, under } = kit.colors;
  const { hip, shoulder, girth: g, width: wv } = s.b;
  if (kind === 'spine') {
    lathe(kit, [-0.09 * g, 0], [[hip + 0.03, 0.035 * g, 0.045 * wv], [shoulder + 0.01, 0.04 * g, 0.05 * wv], [shoulder + 0.03, 0.025 * g, 0.035 * wv]], 8, suit, { square: 3 });
    const u = -0.132 * g;
    for (const w of [hip + 0.1, hip + 0.15]) hexa(kit, [[u, -0.022, w], [u + 0.006, -0.022, w], [u + 0.006, 0.022, w], [u, 0.022, w], [u, -0.022, w + 0.018], [u + 0.006, -0.022, w + 0.018], [u + 0.006, 0.022, w + 0.018], [u, 0.022, w + 0.018]], trim, true);
  } else if (kind === 'jump') {
    // A frame across the back, two thrusters pointing down, lit at the ends.
    lathe(kit, [-0.095 * g, 0], [[shoulder - 0.13, 0.03 * g, 0.1 * wv], [shoulder + 0.02, 0.035 * g, 0.11 * wv]], 8, under, { square: 4 });
    for (const v of [-0.07, 0.07]) {
      const top = [-0.14 * g, v * wv, shoulder + 0.01];
      const end = [-0.15 * g, v * wv * 1.1, hip + 0.02];
      tube(kit, top, end, 0.028 * g, 0.036 * g, suit, 8);
      tube(kit, end, add(end, [0, 0, -0.012]), 0.03 * g, 0.03 * g, trim, 8, true);
    }
  }
}

// The egg: its visor wraps round the front, lit (egg, fin, crest) or dark
// glass (mirror); a fin or a low crest over the top in the trim.
function helmet(kit: Kit, s: Skeleton, kind: string): void {
  const { suit, trim, under } = kit.colors;
  tube(kit, s.neck, add(s.neck, [0, 0, 0.05]), 0.03, 0.028, under, 8);
  const c = add(s.head, [-0.005, 0, 0.022]);
  const dark = kind === 'mirror';
  ball(kit, c, [0.096, 0.08, 0.1], (lat, lon) => {
    if (Math.cos(lon) > -0.2 && lat > -0.3 && lat < 0.5) return dark ? { color: kit.colors.glass } : { color: kit.colors.visor, emissive: true };
    return { color: suit };
  }, 16, 9, HELMET);
  if (kind === 'fin') ridge(kit, c, 0.1, 0.32, 0.3, trim);
  if (kind === 'crest') ridge(kit, c, 0.1, 0.1, 0.45, trim);
}
