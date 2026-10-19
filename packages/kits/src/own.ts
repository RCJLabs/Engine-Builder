/**
 * A slice's map read by id. `constructor` is a valid record id, and a plain object answers it
 * with Object.prototype's, so a map keyed by ids is read for its own entries only.
 */
export const own = <T>(map: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(map, key) ? map[key] : undefined;
