/**
 * Canonical JSON for game state: RFC 8785, the JSON Canonicalization Scheme (docs/specs/state-hash.md).
 *
 * The same state always gives the same text, whatever order its keys were set in, so it can be
 * hashed, compared and matched by a port in another language. Keys sort by UTF-16 code units and
 * numbers print as JSON.stringify prints them, which is exactly what RFC 8785 specifies.
 *
 * Stricter than JSON.stringify on purpose: a save is JSON, so anything JSON would mangle (NaN to
 * null, a Map to {}) throws here with the path to it, rather than hashing quietly and failing
 * after a reload.
 */
export class CanonicalError extends Error {
  /** RFC 6901 JSON Pointer to the bad value; empty for the root. */
  readonly path: string;

  constructor(path: string, problem: string) {
    super(`${path || '(root)'}: ${problem}`);
    this.name = 'CanonicalError';
    this.path = path;
  }
}

/** One JSON Pointer segment (RFC 6901): `~` becomes `~0` and `/` becomes `~1`. */
export const pointerSegment = (key: string | number): string => String(key).replace(/~/g, '~0').replace(/\//g, '~1');

/**
 * A JSON Pointer's keys, unescaped: `~1` back to `/` first, then `~0` back to `~`, the order RFC
 * 6901 gives, so `~01` reads as `~1`. The empty pointer is the whole value: no keys.
 */
export const pointerKeys = (pointer: string): string[] =>
  pointer === ''
    ? []
    : pointer
        .slice(1)
        .split('/')
        .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));

/**
 * The canonical JSON text of a value. `path` prefixes error paths when the value sits inside a
 * larger state (a facet), so an error names the whole route.
 */
export function canonicalJson(value: unknown, path = ''): string {
  return write(value, path, []);
}

function write(value: unknown, path: string, ancestors: object[]): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new CanonicalError(path, `${value} has no JSON form`);
      return JSON.stringify(value); // ES shortest round trip, as RFC 8785 requires; -0 prints as 0
    case 'object':
      return value === null ? 'null' : writeObject(value, path, ancestors);
    case 'bigint':
      throw new CanonicalError(path, 'a bigint has no JSON form; store it as a string');
    default:
      throw new CanonicalError(
        path,
        `${typeof value === 'undefined' ? 'undefined' : `a ${typeof value}`} has no JSON form`,
      );
  }
}

function writeObject(value: object, path: string, ancestors: object[]): string {
  if (ancestors.includes(value)) throw new CanonicalError(path, 'cycle: this value contains itself');
  ancestors.push(value);
  const text = Array.isArray(value) ? writeArray(value, path, ancestors) : writeRecord(value, path, ancestors);
  ancestors.pop();
  return text;
}

function writeArray(items: readonly unknown[], path: string, ancestors: object[]): string {
  const parts: string[] = [];
  for (let i = 0; i < items.length; i++) {
    if (!(i in items)) throw new CanonicalError(`${path}/${i}`, 'a hole in a sparse array has no JSON form');
    parts.push(write(items[i], `${path}/${i}`, ancestors)); // undefined in an array throws: JSON would write null
  }
  return `[${parts.join(',')}]`;
}

function writeRecord(value: object, path: string, ancestors: object[]): string {
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    const kind = (value as { constructor?: { name?: string } }).constructor?.name || 'unknown';
    throw new CanonicalError(path, `a ${kind} is not plain data; use plain objects and arrays`);
  }
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  // The default sort compares UTF-16 code units, which is the order RFC 8785 specifies.
  for (const key of Object.keys(record).sort()) {
    const child = record[key];
    if (child === undefined) continue; // JSON leaves undefined properties out; so does a reloaded save
    parts.push(`${JSON.stringify(key)}:${write(child, `${path}/${pointerSegment(key)}`, ancestors)}`);
  }
  return `{${parts.join(',')}}`;
}
