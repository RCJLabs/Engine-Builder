// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// The classic EVA suit (looks.js): puffy and pale, ringed at the joints, a
// hard chest with its controls, a pack on the back and a bubble helmet.
// The trim runs over the top of the helmet and on the pack's lid, and with
// stripes, round the arms and legs.
import type { Vec3 } from '../solid.ts';
import type { Skeleton } from './bones.ts';
import type { Look } from './looks.ts';
import { add, ball, band, block, boot, cubeAt, HELMET, hexa, type Kit, lathe, mix, rod, sub, tube } from './shapes.ts';

export function dressEva(kit: Kit, s: Skeleton, look: Look): void {
  const { suit, trim, dark } = kit.colors;
  const { hip, shoulder, girth: g, width: wv } = s.b;
  const stripes = look.marks === 'stripes';
  for (let i = 0; i < 2; i++) {
    tube(kit, s.hips[i], s.knees[i], 0.054 * g, 0.047 * g, suit);
    if (stripes) band(kit, mix(s.hips[i], s.knees[i], 0.4), sub(s.knees[i], s.hips[i]), 0.057 * g, 0.035, trim);
    band(kit, s.knees[i], sub(s.feet[i], s.hips[i]), 0.05 * g, 0.03, dark);
    tube(kit, s.knees[i], s.feet[i], 0.047 * g, 0.045 * g, suit);
    boot(kit, s.feet[i], 0.052 * g, 0.09, 0.08, suit, dark);
  }
  // The hard upper torso, the waist ring, the controls on the chest.
  const ring = (w: number, ru: number, rv: number): Vec3 => [w, ru * g, rv * wv];
  lathe(kit, [0, 0], [ring(hip - 0.04, 0.085, 0.1), ring(hip + 0.05, 0.096, 0.115), ring(shoulder - 0.06, 0.112, 0.14), ring(shoulder + 0.02, 0.1, 0.13), ring(shoulder + 0.05, 0.06, 0.09)], 14, suit, { square: 3 });
  lathe(kit, [0, 0], [ring(hip - 0.01, 0.093, 0.11), ring(hip + 0.02, 0.095, 0.112)], 14, dark, { top: false, square: 3 });
  const front = 0.1 * g;
  block(kit, [front, -0.06, hip + 0.08], [front + 0.045, 0.06, hip + 0.15], suit);
  block(kit, [front + 0.045, -0.05, hip + 0.09], [front + 0.048, 0.05, hip + 0.14], dark);
  for (const [v, c] of [[-0.03, trim], [0, kit.colors.lamp], [0.03, kit.colors.visor]] as [number, string][]) block(kit, [front + 0.046, v - 0.009, hip + 0.112], [front + 0.051, v + 0.009, hip + 0.128], c, true);
  pack(kit, s, look.back);
  for (let i = 0; i < 2; i++) {
    ball(kit, s.shoulders[i], [0.055 * g, 0.055 * g, 0.055 * g], () => ({ color: suit }), 8, 5);
    tube(kit, s.shoulders[i], s.elbows[i], 0.046 * g, 0.043 * g, suit);
    if (stripes) band(kit, mix(s.shoulders[i], s.elbows[i], 0.5), sub(s.elbows[i], s.shoulders[i]), 0.049 * g, 0.035, trim);
    band(kit, s.elbows[i], sub(s.hands[i], s.shoulders[i]), 0.046 * g, 0.026, dark);
    tube(kit, s.elbows[i], s.hands[i], 0.043 * g, 0.04 * g, suit);
    band(kit, mix(s.elbows[i], s.hands[i], 0.92), sub(s.hands[i], s.elbows[i]), 0.044 * g, 0.02, dark);
    ball(kit, s.hands[i], [0.036 * g, 0.036 * g, 0.036 * g], () => ({ color: suit }), 6, 4);
  }
  helmet(kit, s, look.helmet);
}

// On the back: a life-support pack, with its lid in the trim and hoses to
// the chest, or one of its kind.
function pack(kit: Kit, s: Skeleton, kind: string): void {
  const { suit, trim, dark } = kit.colors;
  const { hip, shoulder, girth: g, width: wv } = s.b;
  const at = -0.16 * g;
  const box = (u: number, wide: number, deep: number, from: number, to: number, color: string, top = false) => lathe(kit, [u, 0], [[from, deep, wide], [to, deep, wide]], 12, color, { square: 5, top });
  const hoses = () => {
    for (const v of [-0.07, 0.07]) tube(kit, [at + 0.05, v * wv, hip + 0.06], [0.06 * g, v * 1.2 * wv, hip + 0.1], 0.012, 0.012, dark, 6);
  };
  switch (kind) {
    case 'life':
    case 'tools':
    case 'junk':
      box(at, 0.108 * wv, 0.058 * g, hip + 0.03, shoulder + 0.03, suit);
      box(at, 0.095 * wv, 0.05 * g, shoulder + 0.03, shoulder + 0.055, trim, true);
      hoses();
      if (kind === 'tools') {
        // A mast with a lamp at its tip, and a rack of tools at the side.
        rod(kit, [at - 0.02, 0.08 * wv, shoulder + 0.05], [at - 0.03, 0.08 * wv, shoulder + 0.22], 0.007, dark);
        cubeAt(kit, [at - 0.03, 0.08 * wv, shoulder + 0.225], 0.014, kit.colors.lamp, true);
        block(kit, [at - 0.05, -0.15 * wv, hip + 0.06], [at + 0.03, -0.11 * wv, shoulder - 0.04], dark);
        block(kit, [at - 0.03, -0.158 * wv, hip + 0.1], [at + 0.01, -0.15 * wv, shoulder - 0.08], trim);
      }
      if (kind === 'junk') {
        // Scrap strapped across the pack, a pipe out of the top.
        hexa(kit, [[at - 0.064 * g, -0.1, hip + 0.06], [at - 0.078 * g, -0.1, hip + 0.06], [at - 0.078 * g, 0.03, hip + 0.16], [at - 0.064 * g, 0.03, hip + 0.16], [at - 0.064 * g, -0.03, hip + 0.03], [at - 0.078 * g, -0.03, hip + 0.03], [at - 0.078 * g, 0.1, hip + 0.13], [at - 0.064 * g, 0.1, hip + 0.13]], dark);
        band(kit, [at, 0, hip + 0.14], [0, 0, 1], 0.07 * g + 0.004, 0.02, trim);
        tube(kit, [at - 0.01, -0.05, shoulder + 0.03], [at - 0.06, -0.08, shoulder + 0.15], 0.016, 0.016, dark, 6);
      }
      break;
    case 'med': {
      // A slimmer pack with a plus on its back in the trim.
      const u = at + 0.02;
      box(u, 0.09 * wv, 0.045 * g, hip + 0.05, shoulder + 0.02, suit);
      box(u, 0.08 * wv, 0.04 * g, shoulder + 0.02, shoulder + 0.045, trim, true);
      const back = u - 0.045 * g - 0.004;
      const mid = (hip + shoulder) / 2 + 0.02;
      block(kit, [back - 0.006, -0.013, mid - 0.05], [back + 0.004, 0.013, mid + 0.05], trim);
      block(kit, [back - 0.006, -0.05, mid - 0.013], [back + 0.004, 0.05, mid + 0.013], trim);
      hoses();
      break;
    }
    case 'tanks':
      // Twin tanks in the trim, banded.
      for (const v of [-0.058, 0.058]) {
        const [from, to]: Vec3[] = [[at, v * wv, hip - 0.01], [at, v * wv, shoulder + 0.03]];
        tube(kit, from, to, 0.05 * g, 0.05 * g, trim, 10);
        ball(kit, to, [0.05 * g, 0.05 * g, 0.032], () => ({ color: trim }), 10, 4);
        for (const t of [0.25, 0.75]) band(kit, mix(from, to, t), [0, 0, 1], 0.053 * g, 0.02, dark);
      }
      hoses();
      break;
    default:
      break;
  }
}

// The bubble: a dark visor with a glint (bubble), and two lamps at its
// sides (lamps); or an opaque helmet with a band of light (bar). The trim
// runs over the top.
function helmet(kit: Kit, s: Skeleton, kind: string): void {
  const { suit, trim, dark } = kit.colors;
  lathe(kit, [s.neck[0], 0], [[s.neck[2] - 0.02, 0.09, 0.098], [s.neck[2] + 0.015, 0.088, 0.096]], 14, dark);
  const c = add(s.head, [0, 0, 0.012]);
  const bar = kind === 'bar';
  ball(kit, c, [0.12, 0.118, 0.118], (lat, lon) => {
    const ahead = Math.cos(lon);
    const across = Math.sin(lon);
    if (bar) {
      if (ahead > 0.25 && lat > -0.05 && lat < 0.3) return { color: kit.colors.visor, emissive: true };
    } else if (ahead > 0.3 && lat > -0.5 && lat < 0.62) {
      return lat > 0.3 && across > -0.45 && across < 0.05 ? { color: kit.colors.visor, emissive: true } : { color: kit.colors.glass };
    }
    if (lat > 0.25 && Math.abs(across) < 0.2) return { color: trim };
    return { color: suit };
  }, 16, 9, HELMET);
  if (kind === 'lamps') {
    for (const v of [-0.115, 0.115]) {
      block(kit, [c[0] - 0.02, v - 0.018, c[2] - 0.005], [c[0] + 0.05, v + 0.018, c[2] + 0.04], dark);
      block(kit, [c[0] + 0.05, v - 0.014, c[2]], [c[0] + 0.056, v + 0.014, c[2] + 0.034], kit.colors.lamp, true);
    }
  }
}
