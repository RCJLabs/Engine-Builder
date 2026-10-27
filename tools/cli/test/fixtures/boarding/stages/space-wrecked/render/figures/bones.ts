// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// A figure's skeleton, posed in its own frame (u ahead, v to its left, w
// up, its feet at the origin): two-bone legs reaching the deck, two-bone
// arms reaching the weapon. The hips, shoulders and head are set by the
// suit and the build; the pose moves the rest.
//   pose.aim     0 at the ready (the weapon across the body) to 1 aimed
//   pose.stride  the walk's phase, 0 to 1 a stride of two steps, or null
//                standing
//   pose.limp    0 to 1: the hands let go and fall to the sides (a figure
//                falling)
import type { Vec3 } from '../solid.ts';
import type { Held } from './looks.ts';
import { add, dot, mix, norm, scale, sub } from './shapes.ts';

export interface Body {
  hip: number;
  shoulder: number;
  shoulderW: number;
  hipW: number;
  upper: number;
  fore: number;
  thigh: number;
  shin: number;
  head: number;
  width: number;
  girth: number;
}

export interface Skeleton {
  b: Body;
  chest: Vec3;
  neck: Vec3;
  head: Vec3;
  shoulders: Vec3[];
  elbows: Vec3[];
  hands: Vec3[];
  hips: Vec3[];
  knees: Vec3[];
  feet: Vec3[];
  grip: Vec3;
  dir: Vec3;
}

type Proportions = Omit<Body, 'width' | 'girth'>;

// Heights and half widths, in cells, for each suit.
const BODIES: Record<string, Proportions> = {
  eva: { hip: 0.35, shoulder: 0.58, shoulderW: 0.135, hipW: 0.058, upper: 0.15, fore: 0.15, thigh: 0.17, shin: 0.17, head: 0.66 },
  skinsuit: { hip: 0.37, shoulder: 0.58, shoulderW: 0.118, hipW: 0.05, upper: 0.15, fore: 0.15, thigh: 0.18, shin: 0.18, head: 0.675 },
};
// A build widens the body (width), thickens its round parts (girth) and
// stretches it (height).
const BUILDS: Record<string, { width: number; girth: number; height: number }> = {
  light: { width: 0.9, girth: 0.88, height: 0.98 },
  standard: { width: 1, girth: 1, height: 1 },
  heavy: { width: 1.16, girth: 1.18, height: 1.03 },
};
const LONG = ['hip', 'shoulder', 'head', 'upper', 'fore', 'thigh', 'shin'] as const;

// The proportions of a suit in a build: BODIES's, plus `width` (the
// shoulders' against the suit's own) and `girth`.
export function bodyOf(suit: string, build: string): Body {
  const base = BODIES[suit] ?? (BODIES.eva as Proportions);
  const { width, girth, height } = BUILDS[build] ?? (BUILDS.standard as { width: number; girth: number; height: number });
  const b = { ...base, width, girth, shoulderW: base.shoulderW * width, hipW: base.hipW * width };
  for (const key of LONG) b[key] = base[key] * height;
  return b;
}

// held: the weapon's shape (looks.js): one hand or two.
export function bones(body: Body, held: Held, { aim = 0, stride = null, limp = 0 }: { aim?: number; stride?: number | null; limp?: number } = {}): Skeleton {
  const b = body;
  const phase = stride == null ? 0 : Math.sin(stride * Math.PI * 2);
  const lift = stride == null ? 0 : 0.012 * Math.abs(phase);
  const chest = [0.015 + 0.02 * aim, 0, b.shoulder - 0.03 + lift];
  const neck = [chest[0] + 0.005, 0, b.shoulder + 0.02 + lift];
  const head = [chest[0] + 0.01, 0, b.head + lift];
  const shoulders = [-1, 1].map((s) => [chest[0], s * b.shoulderW, b.shoulder + lift]);
  const hips = [-1, 1].map((s) => [0, s * b.hipW, b.hip + lift]);
  const feet = [-1, 1].map((s) => [0.012 + 0.09 * phase * s, s * (b.hipW + 0.012), 0.05 + 0.03 * Math.max(0, phase * s)]);
  const knees = hips.map((hip, i) => bend(hip, feet[i] as Vec3, b.thigh, b.shin, [1, 0, 0]));
  const up = b.shoulder / (BODIES.eva as Proportions).shoulder;
  let grip: Vec3;
  let dir: Vec3;
  let support: Vec3;
  if (held.hands === 2) {
    // At the ready the weapon lies across the body, pointing down and to the
    // left; aimed, it points ahead at the shoulder.
    grip = [0.07 + 0.03 * aim, -0.06, (0.43 + 0.11 * aim) * up + lift];
    const tilt = (1 - aim) * 0.3;
    const across = (1 - aim) * 0.55;
    dir = [Math.cos(tilt) * Math.cos(across), Math.cos(tilt) * Math.sin(across), -Math.sin(tilt)];
    support = add(grip, scale(dir, Math.min(0.15, Math.max(0.09, held.length * 0.36))));
  } else {
    // A pistol hangs at the side, pointing at the deck ahead, the other hand
    // at the hip; aimed, both hands hold it out.
    grip = mix([0.05, -(b.shoulderW + 0.005), 0.37 * up], [0.17, -0.035, 0.52 * up], aim);
    grip[2] += lift;
    const tilt = (1 - aim) * 1.0;
    dir = [Math.cos(tilt), 0, -Math.sin(tilt)];
    support = mix([-0.01, b.shoulderW + 0.03, b.hip + lift], add(grip, [-0.012, 0.04, -0.025]), aim);
  }
  const sides = [-1, 1].map((s) => [0, s * (b.shoulderW + 0.035), b.hip - 0.01 + lift]);
  const hands = [mix(grip, sides[0] as Vec3, limp), mix(support, sides[1] as Vec3, limp)];
  const elbows = shoulders.map((sh, i) => bend(sh, hands[i] as Vec3, b.upper, b.fore, [-0.3, (i ? 1 : -1) * 0.9, -0.5]));
  return { b, chest, neck, head, shoulders, elbows, hands, hips, knees, feet, grip, dir };
}

// The middle joint of a two-bone limb from a to c, bending toward `pole`.
function bend(a: Vec3, c: Vec3, upper: number, lower: number, pole: Vec3): Vec3 {
  let d = sub(c, a);
  let len = Math.hypot(...d);
  const reach = upper + lower - 1e-6;
  if (len > reach) {
    d = scale(d, reach / len);
    len = reach;
  }
  const dir = scale(d, 1 / (len || 1));
  const along = (upper * upper - lower * lower + len * len) / (2 * (len || 1));
  const h = Math.sqrt(Math.max(0, upper * upper - along * along));
  const p = norm(sub(pole, scale(dir, dot(pole, dir))));
  return add(add(a, scale(dir, along)), scale(p, h));
}
