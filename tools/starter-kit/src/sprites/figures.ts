/**
 * The starter sprites' figures (M7.1, D83): a guard, a keeper and a villager, 16 by 24 pixels a
 * frame, facing right, standing on the frame's foot. Each frame is drawn from its parts at a pose
 * and outlined in ink, so the six frames of every figure share one build: idle (still, then a nod)
 * and a walk of four (a stride, legs passing, the other stride, passing).
 */
import type { Colour } from './palette.ts';
import { type Frame, Sheet } from './raster.ts';

export interface Look {
  readonly tunic: Colour;
  readonly legs: Colour;
  readonly boots: Colour;
  readonly head: 'helmet' | 'hood' | 'hair';
  readonly carry?: 'spear' | 'lantern';
}

interface Pose {
  /** The two legs' left edges, the one behind first. */
  readonly legs: readonly [number, number];
  /** How far the body rides up, at the legs passing. */
  readonly lift: number;
  /** How far the head drops. */
  readonly nod: number;
  /** Which hand swings up, the one behind or the one in front. */
  readonly swing: -1 | 0 | 1;
}

const STILL: Pose = { legs: [5, 9], lift: 0, nod: 0, swing: 0 };

/** Idle's two frames, then the walk's four. */
export const POSES: readonly Pose[] = [
  STILL,
  { ...STILL, nod: 1 },
  { legs: [3, 10], lift: 0, nod: 0, swing: 1 },
  { legs: [6, 8], lift: 1, nod: 0, swing: 0 },
  { legs: [10, 3], lift: 0, nod: 0, swing: -1 },
  { legs: [8, 6], lift: 1, nod: 0, swing: 0 },
];

export const FIGURE_CLIPS = {
  idle: { frames: [0, 1] as [number, number], fps: 2 },
  walk: { frames: [2, 5] as [number, number], fps: 8 },
};

export const LOOKS: Readonly<Record<string, Look>> = {
  guard: { tunic: 'red', legs: 'stoneDark', boots: 'wood', head: 'helmet', carry: 'spear' },
  keeper: { tunic: 'wood', legs: 'stoneDark', boots: 'ink', head: 'hood', carry: 'lantern' },
  villager: { tunic: 'blue', legs: 'wood', boots: 'ink', head: 'hair' },
};

function legs(f: Frame, look: Look, pose: Pose): void {
  for (const x of pose.legs) {
    f.rect(x, 1, 3, 1, look.boots);
    f.rect(x, 2, 2, 1, look.boots);
    f.rect(x, 3, 2, 4, look.legs);
  }
  f.rect(5, 7, 6, 1, look.legs);
}

function body(f: Frame, look: Look, pose: Pose): void {
  const up = pose.lift;
  f.rect(5, 8 + up, 6, 7, look.tunic);
  f.rect(4, 9 + up, 1, 5, look.tunic);
  f.rect(11, 9 + up, 1, 5, look.tunic);
  f.set(4, 8 + up + (pose.swing === -1 ? 1 : 0), 'skin');
  f.set(11, 8 + up + (pose.swing === 1 ? 1 : 0), 'skin');
}

function head(f: Frame, look: Look, pose: Pose): void {
  const y = 15 + pose.lift - pose.nod;
  if (look.head === 'hood') f.rect(5, y, 6, 5, look.tunic);
  f.rect(look.head === 'hood' ? 7 : 6, y, look.head === 'hood' ? 3 : 4, 3, 'skin');
  f.set(9, y + 1, 'ink');
  if (look.head === 'helmet') {
    f.rect(6, y + 3, 4, 2, 'stoneLight');
    f.rect(5, y + 3, 6, 1, 'stoneLight');
  } else if (look.head === 'hair') {
    f.rect(6, y + 3, 4, 1, 'wood');
    f.set(6, y + 2, 'wood');
  }
}

function carried(f: Frame, look: Look, pose: Pose): void {
  const up = pose.lift;
  if (look.carry === 'spear') {
    f.rect(12, 3 + up, 1, 17, 'wood');
    f.rect(12, 20 + up, 1, 2, 'stoneLight');
  } else if (look.carry === 'lantern') {
    f.set(12, 7 + up, 'stoneDark');
    f.rect(12, 5 + up, 2, 2, 'glow');
  }
}

/** One figure's sheet: six frames across. */
export function figureSheet(look: Look): Sheet {
  const sheet = new Sheet(16, 24, POSES.length);
  POSES.forEach((pose, n) => {
    const f = sheet.frame(n);
    legs(f, look, pose);
    body(f, look, pose);
    head(f, look, pose);
    carried(f, look, pose);
    f.outline('ink');
  });
  return sheet;
}
