/**
 * Seeded random streams for the sim (docs/specs/rng.md).
 *
 * sfc32, seeded by splitmix32 from the FNV-1a hash of a string, after chooser-of-the-dead's
 * engine. Integer math only, so a seed gives the same numbers in every JS engine and in a C++
 * port that follows the spec. Two additions over chooser's version:
 * - `toState()` / `fromState()`: a stream's position is plain data, so it lives in game state
 *   and a reload never rerolls (space-wrecked, Gridiron Eras).
 * - `weightedIndex()`: integer weights, for weighted outcomes and loot tables.
 */
import { fnv1a32 } from './hash.ts';

const TWO_POW_32 = 0x1_0000_0000;
const WARM_UP = 12;
/** Separates a seed from a fork label; it cannot appear in either by accident. */
const FORK_SEPARATOR = '\u001f';

/** A stream's position as plain, JSON-safe data. */
export interface RngState {
  readonly seed: string;
  /** sfc32's four state words, each an unsigned 32-bit integer. */
  readonly s: readonly [number, number, number, number];
}

/** splitmix32: expands one 32-bit seed into well-mixed words. */
function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

const isU32 = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < TWO_POW_32;

export class Rng {
  readonly seed: string;
  #a: number;
  #b: number;
  #c: number;
  #d: number;

  private constructor(seed: string, words: readonly [number, number, number, number]) {
    this.seed = seed;
    [this.#a, this.#b, this.#c, this.#d] = words;
  }

  /** A fresh stream for a seed: the same seed always gives the same sequence. */
  static create(seed: string): Rng {
    const mix = splitmix32(fnv1a32(seed));
    const rng = new Rng(seed, [mix(), mix(), mix(), mix()]);
    for (let i = 0; i < WARM_UP; i++) rng.nextU32();
    return rng;
  }

  /** Resumes a stream exactly where `toState()` left it. */
  static fromState(state: RngState): Rng {
    if (typeof state?.seed !== 'string' || !Array.isArray(state.s) || state.s.length !== 4 || !state.s.every(isU32)) {
      throw new RangeError('Not an RngState: expected { seed: string, s: four unsigned 32-bit integers }');
    }
    return new Rng(state.seed, state.s);
  }

  toState(): RngState {
    return { seed: this.seed, s: [this.#a >>> 0, this.#b >>> 0, this.#c >>> 0, this.#d >>> 0] };
  }

  /**
   * An independent child stream: `rng.fork('loot')`, `rng.fork('weather')`. It depends only on
   * the seed and the label, never on how many numbers were drawn, so adding a draw in one system
   * never shifts another system's rolls.
   */
  fork(label: string | number): Rng {
    return Rng.create(`${this.seed}${FORK_SEPARATOR}${label}`);
  }

  /** The next raw unsigned 32-bit integer. */
  nextU32(): number {
    const t = (((this.#a + this.#b) | 0) + this.#d) | 0;
    this.#d = (this.#d + 1) | 0;
    this.#a = this.#b ^ (this.#b >>> 9);
    this.#b = (this.#c + (this.#c << 3)) | 0;
    this.#c = (this.#c << 21) | (this.#c >>> 11);
    this.#c = (this.#c + t) | 0;
    return t >>> 0;
  }

  /** A uniform integer in [min, max], inclusive, without modulo bias. */
  int(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
      throw new RangeError(`Bad range [${min}, ${max}]`);
    }
    const span = max - min + 1;
    if (span > TWO_POW_32) throw new RangeError(`Range [${min}, ${max}] is wider than 2^32`);
    const limit = TWO_POW_32 - (TWO_POW_32 % span);
    for (;;) {
      const x = this.nextU32();
      if (x < limit) return min + (x % span);
    }
  }

  /** True with probability num/den, both integers: `chance(70, 100)` is 70%. */
  chance(num: number, den: number): boolean {
    if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den < 1 || num < 0 || num > den) {
      throw new RangeError(`Bad odds ${num}/${den}`);
    }
    return this.int(1, den) <= num;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Cannot pick from an empty list');
    return items[this.int(0, items.length - 1)] as T;
  }

  /**
   * An index chosen in proportion to integer weights. A zero weight is never chosen, so a
   * table can switch an entry off without removing it.
   */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (!Number.isSafeInteger(w) || w < 0) throw new RangeError(`Bad weight ${w}: weights are integers ≥ 0`);
      total += w;
    }
    if (total < 1) throw new RangeError('All weights are zero');
    if (total > TWO_POW_32) throw new RangeError('Weights add up to more than 2^32');
    let roll = this.int(0, total - 1);
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i] as number;
      if (roll < 0) return i;
    }
    throw new Error('unreachable: roll exceeded the total');
  }

  /** Fisher–Yates into a new array; the input is left alone. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const held = out[i] as T;
      out[i] = out[j] as T;
      out[j] = held;
    }
    return out;
  }
}
