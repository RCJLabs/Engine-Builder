/**
 * Auto's first tier, from the device's own hints (M5.7, D69, docs/specs/performance.md#choosing-a-tier):
 * a software renderer is Low; a phone or a tablet is Medium, or Low for a GPU the table names as
 * low-end; a computer is High with 8 cores and, where the browser says, 8 GB, else Medium. The
 * table is a first guess: real phones will add to it.
 */
import type { TierName } from './tiers.ts';

export interface Hints {
  /** The GPU's name, from WebGPU's adapter or WebGL's unmasked renderer, or null when neither says. */
  readonly gpu: string | null;
  /** The device's memory in GB, where the browser says (Chrome's `navigator.deviceMemory`). */
  readonly memory: number | null;
  readonly cores: number | null;
  /** Whether the main pointer is coarse: a finger. */
  readonly coarse: boolean;
}

export interface TierPick {
  readonly tier: TierName;
  /** Why, in words the overlay shows: "a phone's GPU", "a software renderer". */
  readonly reason: string;
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|basic render|software/i;
/** Phone GPUs a few generations old, or made for cheap phones. */
const LOW_END =
  /mali-(4\d\d|t[6-8]\d\d|g(31|51|52|57|68))\b|adreno[^\d]*(3\d\d|4\d\d|5\d\d|60\d|61\d)\b|powervr|videocore/i;

export function tierFromHints(hints: Hints): TierPick {
  const gpu = hints.gpu ?? '';
  if (SOFTWARE.test(gpu)) return { tier: 'low', reason: 'a software renderer' };
  if (hints.coarse) {
    return LOW_END.test(gpu)
      ? { tier: 'low', reason: 'a low-end phone GPU' }
      : { tier: 'medium', reason: 'a phone or a tablet' };
  }
  const cores = hints.cores ?? 0;
  const memory = hints.memory ?? Number.POSITIVE_INFINITY;
  return cores >= 8 && memory >= 8
    ? { tier: 'high', reason: 'a computer with 8 cores or more' }
    : { tier: 'medium', reason: 'a computer with fewer than 8 cores or 8 GB' };
}
