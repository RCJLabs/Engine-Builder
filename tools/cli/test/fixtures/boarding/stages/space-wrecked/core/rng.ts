// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// Seeded RNG: mulberry32 with a pure API.
//
// The state is a uint32 number, so it serializes as plain JSON and lives in the
// save. Every function takes a state and returns { value, state }, where state
// is the next state. Nothing here keeps hidden state, so replaying from a saved
// state gives the same rolls and a reload never rerolls.

const UINT32 = 4294967296;

export interface Rolled<T> {
  value: T;
  state: number;
}

export function isState(state: number): boolean {
  return Number.isInteger(state) && state >= 0 && state < UINT32;
}

// Turns a number or a string into a starting state.
export function seedFrom(input: number | string): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new RangeError(`seedFrom: ${input} is not a finite number`);
    return input >>> 0;
  }
  if (typeof input === 'string') {
    // FNV-1a over UTF-16 code units, then the murmur3 finalizer to spread the bits.
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }
  throw new TypeError('seedFrom: expected a number or a string');
}

// A float in [0, 1).
export function next(state: number): Rolled<number> {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / UINT32, state: a >>> 0 };
}

// An integer in [min, max], both ends included.
export function int(state: number, min: number, max: number): Rolled<number> {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new RangeError(`int: bad range ${min}..${max}`);
  }
  const r = next(state);
  return { value: min + Math.floor(r.value * (max - min + 1)), state: r.state };
}

// A percentage check. Rolls an integer 0..99 and succeeds when roll < chance,
// so the chance shown is exactly the chance rolled against: 0 never succeeds
// and 100 always does. Returns the roll too, for logs and replays.
export function percent(state: number, chance: number): Rolled<boolean> & { roll: number } {
  if (!Number.isInteger(chance) || chance < 0 || chance > 100) {
    throw new RangeError(`percent: chance must be an integer 0..100, got ${chance}`);
  }
  const r = int(state, 0, 99);
  return { value: r.value < chance, roll: r.value, state: r.state };
}

// One element of a non-empty array.
export function pick<T>(state: number, list: readonly T[]): Rolled<T> {
  if (!Array.isArray(list) || list.length === 0) throw new RangeError('pick: expected a non-empty array');
  const r = int(state, 0, list.length - 1);
  return { value: list[r.value] as T, state: r.state };
}

// A shuffled copy of an array (Fisher-Yates). The input is not changed.
export function shuffle<T>(state: number, list: readonly T[]): Rolled<T[]> {
  if (!Array.isArray(list)) throw new TypeError('shuffle: expected an array');
  const out = list.slice();
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const r = int(s, 0, i);
    s = r.state;
    const j = r.value;
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return { value: out, state: s };
}
