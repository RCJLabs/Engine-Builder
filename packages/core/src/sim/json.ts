import { CanonicalError, pointerSegment } from '../canonical.ts';

/**
 * Deep-freezes a value after checking it is JSON a save can hold, by the same rules as
 * canonicalJson: finite numbers, plain objects, dense arrays, no cycles, and undefined only as
 * an object property (which a save leaves out). Throws CanonicalError naming the path, so a NaN
 * or a Map is caught by the action that stored it rather than by a save much later.
 */
export function freezeJson(value: unknown, path: string): void {
  check(value, path, []);
}

function check(value: unknown, path: string, ancestors: object[]): void {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return;
    case 'number':
      if (!Number.isFinite(value)) throw new CanonicalError(path, `${value} has no JSON form`);
      return;
    case 'object':
      if (value !== null) checkObject(value, path, ancestors);
      return;
    default:
      throw new CanonicalError(
        path,
        `${typeof value === 'undefined' ? 'undefined' : `a ${typeof value}`} has no JSON form`,
      );
  }
}

function checkObject(value: object, path: string, ancestors: object[]): void {
  if (ancestors.includes(value)) throw new CanonicalError(path, 'cycle: this value contains itself');
  ancestors.push(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) throw new CanonicalError(`${path}/${i}`, 'a hole in a sparse array has no JSON form');
      check(value[i], `${path}/${i}`, ancestors);
    }
  } else {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      const kind = (value as { constructor?: { name?: string } }).constructor?.name || 'unknown';
      throw new CanonicalError(path, `a ${kind} is not plain data; use plain objects and arrays`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) check(child, `${path}/${pointerSegment(key)}`, ancestors);
    }
  }
  ancestors.pop();
  Object.freeze(value);
}

/** A deep copy of a JSON value, for a handler to change. Shared sub-values become separate copies, as after a reload. */
export function cloneJson<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map(cloneJson) as T;
  // fromEntries defines own properties, as JSON.parse does; plain assignment would turn a
  // "__proto__" key into a prototype change.
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneJson(child)])) as T;
}
