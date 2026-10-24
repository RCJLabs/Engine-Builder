/**
 * Rain and snow as they fall (M5.4, D66, docs/specs/environments.md#fog-and-weather): each drop's
 * place a plain function of its seed, the moment and where the camera looks, so a frame needs no
 * memory of the last and a still frame (reduced motion) is the moment 0. Drops fall through a box
 * BOX metres across around that point and come back in at its top.
 */
import type { Vec3 } from './look.ts';

export const BOX = 60;
/** Metres a second. */
export const FALL = { rain: 9, snow: 1 } as const;
/** How long a rain streak is, in metres: how far a drop falls in a fifteenth of a second. */
export const STREAK = FALL.rain / 15;
/** How far a flake drifts either way, in metres. */
export const DRIFT = 0.6;

export type Falling = keyof typeof FALL;

// A drop's start in the box, from its number alone: the same drops every time the view opens.
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Each drop's start, x, y and z, within the box: x and z from −BOX/2, y from 0 up to BOX. */
export function seedDrops(count: number): Float32Array {
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    seeds[i * 3] = (hash(i * 3) - 0.5) * BOX;
    seeds[i * 3 + 1] = hash(i * 3 + 1) * BOX;
    seeds[i * 3 + 2] = (hash(i * 3 + 2) - 0.5) * BOX;
  }
  return seeds;
}

const wrap = (n: number, size: number) => ((n % size) + size) % size;

/**
 * Drop `i`'s place at `seconds`, around `centre`: fallen by its speed, back in at the top when it
 * leaves the bottom, and wrapped across, so the box follows the camera with no drop jumping in view.
 */
export function dropAt(seeds: Float32Array, i: number, kind: Falling, seconds: number, centre: Vec3): Vec3 {
  const [sx, sy, sz] = [seeds[i * 3] ?? 0, seeds[i * 3 + 1] ?? 0, seeds[i * 3 + 2] ?? 0];
  const sway = kind === 'snow' ? DRIFT * Math.sin(seconds * 0.7 + i) : 0;
  const across = (start: number, at: number) => wrap(start + sway - at + BOX / 2, BOX) - BOX / 2 + at;
  const y = wrap(sy - FALL[kind] * seconds - centre[1], BOX) + centre[1] - BOX / 2;
  return [across(sx, centre[0]), y, across(sz, centre[2])];
}
