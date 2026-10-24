/**
 * Where a ray from the camera meets the terrain (M5.3): what a brush is under. Marched in steps of
 * half a spacing through the terrain's box, then halved down to the crossing, on the same
 * triangles the view draws (grid.ts's heightAt). A plain function, so a test can aim it.
 */
import { extentOf, heightAt, type TerrainGrid } from './grid.ts';

type Vec3 = readonly [number, number, number];

/** The ray's entry and exit along its length through the box the terrain fills, or null when it misses. */
function throughBox(g: TerrainGrid, origin: Vec3, dir: Vec3): [number, number] | null {
  const e = extentOf(g);
  const lo = [-e, g.low, -e];
  const hi = [e, g.high, e];
  let near = 0;
  let far = Number.POSITIVE_INFINITY;
  for (let k = 0; k < 3; k++) {
    const o = origin[k] as number;
    const d = dir[k] as number;
    if (Math.abs(d) < 1e-12) {
      if (o < (lo[k] as number) || o > (hi[k] as number)) return null;
      continue;
    }
    let t0 = ((lo[k] as number) - o) / d;
    let t1 = ((hi[k] as number) - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far) return null;
  }
  return [near, far];
}

/** The first point the ray meets the ground, or null when it misses the terrain; `dir` need not be of length 1. */
export function groundHit(g: TerrainGrid, origin: Vec3, dir: Vec3): [number, number, number] | null {
  const length = Math.hypot(dir[0], dir[1], dir[2]);
  if (length === 0) return null;
  const d: Vec3 = [dir[0] / length, dir[1] / length, dir[2] / length];
  const span = throughBox(g, origin, d);
  if (!span) return null;
  const at = (t: number) => [origin[0] + d[0] * t, origin[1] + d[1] * t, origin[2] + d[2] * t] as const;
  const below = (t: number) => {
    const [x, y, z] = at(t);
    return y <= heightAt(g, x, z);
  };
  const step = g.spacing / 2;
  let before = span[0];
  if (below(before)) return [...at(before)];
  for (let t = before + step; ; t += step) {
    const end = Math.min(t, span[1]);
    if (below(end)) {
      let lo = before;
      let hi = end;
      for (let n = 0; n < 24; n++) {
        const mid = (lo + hi) / 2;
        if (below(mid)) hi = mid;
        else lo = mid;
      }
      return [...at(hi)];
    }
    if (end >= span[1]) return null;
    before = end;
  }
}
