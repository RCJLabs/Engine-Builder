/**
 * The starter character's clips (M6.5, D77, docs/specs/animation.md#the-starter-character), each a
 * pose by the time in seconds, written by formula and sampled at 30 frames a second. They play in
 * place: a walk's and a run's pace say how fast the body moves while they play. A swing's and a
 * bow's clips are a second long, for the stage to fit to each phase.
 */
import { between, ease, type Pose, STAND, standing } from './poses.ts';

export interface ClipDef {
  readonly name: string;
  readonly length: number;
  readonly loop: boolean;
  /** Metres a second it is made for; 0 for one that stays put. */
  readonly pace: number;
  readonly at: (t: number) => Pose;
}

const TAU = Math.PI * 2;
const hips = (x: number, y: number, z = 0) => [x, 0.95 + y, z] as const;

/** One step cycle: the legs and arms swinging opposite, the knee bending as each leg comes through. */
function stride(
  phase: number,
  size: { legs: number; knees: number; arms: number; elbows: number; lean: number; bob: number },
): Pose {
  const s = Math.sin(phase);
  const knee = (p: number) => -(0.1 + size.knees * Math.max(0, Math.cos(p)));
  return standing({
    turns: {
      leftUpperLeg: [size.legs * s, 0, 0],
      rightUpperLeg: [-size.legs * s, 0, 0],
      leftLowerLeg: [knee(phase), 0, 0],
      rightLowerLeg: [knee(phase + Math.PI), 0, 0],
      leftFoot: [0.15 * s, 0, 0],
      rightFoot: [-0.15 * s, 0, 0],
      leftUpperArm: [-size.arms * s, 0, 0],
      rightUpperArm: [size.arms * s, 0, 0],
      leftLowerArm: [0, -size.elbows, 0],
      rightLowerArm: [0, size.elbows, 0],
      spine: [-size.lean, 0.08 * s, 0],
      chest: [0, -0.05 * s, 0],
      hips: [0, -0.06 * s, 0],
    },
    hips: hips(0.02 * s, size.bob * Math.cos(2 * phase) - size.bob),
  });
}

/**
 * A swing's three poses: the sword hand raised over the head and back, cut down through to the
 * waist in front, and the standing pose it recovers to. The hand comes 0.75 m down and 0.84 m
 * forward over the strike.
 */
const WOUND: Pose = standing({
  turns: { rightUpperArm: [0.5, 0.4, 2.5], rightLowerArm: [0, 0, 1.3], spine: [0, -0.3, 0], chest: [0, -0.15, 0] },
});
const STRUCK: Pose = standing({
  turns: { rightUpperArm: [0.9, 0, 0.3], rightLowerArm: [0, 0.25, 0], spine: [-0.3, 0.3, 0], chest: [-0.1, 0.15, 0] },
});
/** A bow drawn: the left arm out in front holding it, the right hand back at the chin. */
const DRAWN: Pose = standing({
  turns: {
    leftUpperArm: [1.5, 0, 0],
    leftLowerArm: [0, 0.1, 0],
    rightUpperArm: [1.4, 0, 0],
    rightLowerArm: [0, 1.85, 0],
    spine: [0, -0.3, 0],
  },
});
const LOOSED: Pose = standing({
  turns: {
    leftUpperArm: [1.5, 0, 0],
    leftLowerArm: [0, 0.1, 0],
    rightUpperArm: [1.2, 0, -0.2],
    rightLowerArm: [0, 1.5, 0],
    spine: [0, -0.3, 0],
  },
});
/** Lying on its back where it fell. */
const LYING: Pose = standing({
  turns: { hips: [1.5, 0, 0], leftUpperArm: [0, 0, -0.15], rightUpperArm: [0, 0, 0.15], head: [-0.2, 0, 0] },
  hips: hips(0, -0.8, 0.55),
});

export const CLIPS: readonly ClipDef[] = [
  {
    name: 'idle',
    length: 3,
    loop: true,
    pace: 0,
    at: (t) => {
      const p = (TAU * t) / 3;
      return standing({
        turns: {
          chest: [-0.03 * Math.sin(p), 0, 0],
          head: [0, 0.05 * Math.sin(p), 0],
          leftUpperArm: [0, 0, 0.03 * Math.sin(p)],
          rightUpperArm: [0, 0, -0.03 * Math.sin(p)],
        },
      });
    },
  },
  {
    name: 'walk',
    length: 1.1,
    loop: true,
    pace: 1.4,
    at: (t) => stride((TAU * t) / 1.1, { legs: 0.45, knees: 0.6, arms: 0.35, elbows: 0.3, lean: 0.03, bob: 0.02 }),
  },
  {
    name: 'run',
    length: 0.7,
    loop: true,
    pace: 4,
    at: (t) => stride((TAU * t) / 0.7, { legs: 0.8, knees: 1.2, arms: 0.6, elbows: 1.4, lean: 0.2, bob: 0.04 }),
  },
  {
    name: 'jump',
    length: 0.3,
    loop: false,
    pace: 0,
    at: (t) => {
      const u = 1 - ease(t / 0.3);
      return standing({
        turns: {
          leftUpperLeg: [0.4 * u, 0, 0],
          rightUpperLeg: [0.4 * u, 0, 0],
          leftLowerLeg: [-0.6 * u, 0, 0],
          rightLowerLeg: [-0.6 * u, 0, 0],
          leftUpperArm: [0, 0, -0.9 * (1 - u)],
          rightUpperArm: [0, 0, 0.9 * (1 - u)],
        },
        hips: hips(0, -0.12 * u),
      });
    },
  },
  {
    name: 'fall',
    length: 0.8,
    loop: true,
    pace: 0,
    at: (t) => {
      const f = 0.15 * Math.sin((TAU * t) / 0.8);
      return standing({
        turns: {
          leftUpperArm: [f, 0, -0.75],
          rightUpperArm: [-f, 0, 0.75],
          leftUpperLeg: [0.3, 0, 0],
          leftLowerLeg: [-0.5, 0, 0],
          rightUpperLeg: [0.1, 0, 0],
          rightLowerLeg: [-0.3, 0, 0],
          spine: [-0.1, 0, 0],
        },
      });
    },
  },
  {
    name: 'land',
    length: 0.3,
    loop: false,
    pace: 0,
    at: (t) => {
      const d = Math.sin((Math.PI * t) / 0.3);
      return standing({
        turns: {
          leftUpperLeg: [0.5 * d, 0, 0],
          rightUpperLeg: [0.5 * d, 0, 0],
          leftLowerLeg: [-0.7 * d, 0, 0],
          rightLowerLeg: [-0.7 * d, 0, 0],
          leftUpperArm: [0, 0, -0.25 * d],
          rightUpperArm: [0, 0, 0.25 * d],
        },
        hips: hips(0, -0.12 * d),
      });
    },
  },
  { name: 'windup', length: 1, loop: false, pace: 0, at: (t) => between(STAND, WOUND, ease(t)) },
  { name: 'strike', length: 1, loop: false, pace: 0, at: (t) => between(WOUND, STRUCK, ease(t)) },
  { name: 'recover', length: 1, loop: false, pace: 0, at: (t) => between(STRUCK, STAND, ease(t)) },
  { name: 'draw', length: 1, loop: false, pace: 0, at: (t) => between(STAND, DRAWN, ease(t)) },
  {
    name: 'hold',
    length: 1,
    loop: true,
    pace: 0,
    at: (t) => between(DRAWN, LOOSED, 0.05 + 0.05 * Math.sin(TAU * t)),
  },
  { name: 'loose', length: 1, loop: false, pace: 0, at: (t) => between(DRAWN, LOOSED, ease(t * 3)) },
  {
    name: 'hit',
    length: 0.4,
    loop: false,
    pace: 0,
    at: (t) => {
      const d = Math.sin((Math.PI * t) / 0.4);
      return standing({
        turns: {
          spine: [0.25 * d, 0, 0],
          head: [0.3 * d, 0, 0],
          leftUpperArm: [0, 0, -0.3 * d],
          rightUpperArm: [0, 0, 0.3 * d],
        },
      });
    },
  },
  {
    name: 'fall-down',
    length: 0.8,
    loop: false,
    pace: 0,
    at: (t) => {
      const e = ease(t / 0.8);
      const tip = 1.5 * e;
      // The hips come down only as the straight legs tip, the heels' 6 cm behind the ankle with
      // them, so the feet stay on the ground as it falls back.
      return {
        turns: between(STAND, LYING, e).turns,
        hips: [0, Math.max(0.15, 0.95 * Math.cos(tip) + 0.07 * Math.sin(tip)), 0.55 * e],
      };
    },
  },
  {
    name: 'lie',
    length: 2,
    loop: true,
    pace: 0,
    // LYING has the standing turns in it already: the breath is its chest alone.
    at: (t) =>
      between(LYING, { ...LYING, turns: { ...LYING.turns, chest: [-0.04, 0, 0] } }, 0.5 + 0.5 * Math.sin(Math.PI * t)),
  },
  {
    name: 'talk',
    length: 2.5,
    loop: true,
    pace: 0,
    at: (t) => {
      const p = (TAU * t) / 2.5;
      return standing({
        turns: {
          rightUpperArm: [0.3 + 0.15 * Math.sin(2 * p), 0, 0],
          rightLowerArm: [0, 0.8 * (0.5 + 0.5 * Math.sin(p)), 0],
          head: [0.05 * Math.sin(2 * p), 0.08 * Math.sin(p), 0],
        },
      });
    },
  },
];
