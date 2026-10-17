/**
 * Fingerprints of game state, for goldens, save and replay checks, and parity with a port
 * (docs/specs/state-hash.md). The facet idea and its reasons come from landnam's
 * src/run/parity.ts.
 */
import { CanonicalError, canonicalJson, pointerSegment } from './canonical.ts';
import { fnv1a64, utf8Length } from './hash.ts';

/** FNV-1a 64 of a value's canonical JSON: 16 hex digits. A fingerprint, not a cryptographic hash. */
export const stateHash = (value: unknown): string => fnv1a64(canonicalJson(value));

export interface FacetReading {
  readonly hash: string;
  /** UTF-8 bytes of the facet's canonical JSON: a different size means a different shape, not just a different value. */
  readonly size: number;
}

/**
 * One reading per top-level key of the state.
 *
 * A whole-state hash is all-or-nothing: a port, or a refactor, stays red until everything
 * matches and says nothing along the way. Facets go green one at a time. Top-level keys are the
 * facets, so together they cover the state exactly; `exclude` names the parts that are about the
 * telling rather than the game (a log, a chronicle), and naming a key that isn't there throws,
 * so a typo can't quietly stop a facet being checked.
 */
export function readFacets(
  state: Readonly<Record<string, unknown>>,
  options: { readonly exclude?: readonly string[] } = {},
): Record<string, FacetReading> {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    throw new CanonicalError('', 'facets need an object at the top of the state');
  }
  const exclude = new Set(options.exclude ?? []);
  for (const key of exclude) {
    if (!Object.hasOwn(state, key)) throw new RangeError(`exclude names "${key}", which is not in the state`);
  }
  const readings: Record<string, FacetReading> = {};
  for (const key of Object.keys(state).sort()) {
    if (exclude.has(key) || state[key] === undefined) continue;
    const text = canonicalJson(state[key], `/${pointerSegment(key)}`);
    readings[key] = { hash: fnv1a64(text), size: utf8Length(text) };
  }
  return readings;
}

export interface Difference {
  /** RFC 6901 JSON Pointer; empty for the root. */
  readonly path: string;
  /** The value on each side at that path; undefined where that side has nothing. */
  readonly a: unknown;
  readonly b: unknown;
}

type Shape = 'missing' | 'array' | 'object' | 'leaf';

const shapeOf = (value: unknown): Shape =>
  value === undefined
    ? 'missing'
    : Array.isArray(value)
      ? 'array'
      : typeof value === 'object' && value !== null
        ? 'object'
        : 'leaf';

/**
 * The first place two states differ, walking keys in canonical order, or null when they are equal
 * as JSON. A bare hash mismatch is "a smoke alarm with no address" (landnam); this is the address.
 */
export function firstDifference(a: unknown, b: unknown): Difference | null {
  return walk(a, b, '');
}

function walk(a: unknown, b: unknown, path: string): Difference | null {
  const shape = shapeOf(a);
  if (shape !== shapeOf(b)) return { path, a, b };
  if (shape === 'array') {
    const left = a as readonly unknown[];
    const right = b as readonly unknown[];
    const shared = Math.min(left.length, right.length);
    for (let i = 0; i < shared; i++) {
      const found = walk(left[i], right[i], `${path}/${i}`);
      if (found) return found;
    }
    return left.length === right.length ? null : { path: `${path}/${shared}`, a: left[shared], b: right[shared] };
  }
  if (shape === 'object') {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
      const found = walk(left[key], right[key], `${path}/${pointerSegment(key)}`);
      if (found) return found;
    }
    return null;
  }
  // Leaves compare by canonical text, so -0 equals 0 here exactly as it does in the hash.
  return shape === 'missing' || canonicalJson(a, path) === canonicalJson(b, path) ? null : { path, a, b };
}
