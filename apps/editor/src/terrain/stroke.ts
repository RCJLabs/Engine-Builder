/**
 * A brush stroke over a terrain's grid (M5.3, D65): a dab where it starts, then one every half
 * spacing along the ground the pointer crosses, so the result hangs on the path, not on how fast it
 * was drawn. Flatten's target is the height under the first dab. The part a stroke changes is
 * copied as it starts, so one a pinch cuts short goes back as it was.
 */
import type { TerrainPart } from '@eb/compiler';
import { type Area, type Brush, dab, dabsAlong, unionOf } from './brushes.ts';
import { heightAt, type TerrainGrid } from './grid.ts';

export interface Stroke {
  readonly part: TerrainPart;
  readonly brush: Brush;
  /** Every vertex the stroke has changed so far, or null for none. */
  area(): Area | null;
  /** On to (x, z), dabbing along the way: the area those dabs reached. */
  to(x: number, z: number): Area | null;
  /** The pointer left the ground: the next point starts afresh with a dab, rather than dabbing across the gap. */
  lift(): void;
  /** Puts the grid back as it was before the stroke: the area put back. */
  undo(): Area | null;
}

export const partOf = (brush: Brush): TerrainPart =>
  brush.kind === 'paint' ? 'paint' : brush.kind === 'plant' || brush.kind === 'clear' ? 'foliage' : 'heights';

/** The array a stroke of `part` changes. */
const changesOf = (g: TerrainGrid, part: TerrainPart): Float32Array | Uint8Array =>
  part === 'paint' ? g.paint : part === 'foliage' ? g.foliage : g.heights;

export function startStroke(g: TerrainGrid, brush: Brush, x: number, z: number): Stroke {
  const part = partOf(brush);
  const before = changesOf(g, part).slice();
  const target = heightAt(g, x, z);
  const step = g.spacing / 2;
  let last: [number, number] | null = null;
  let carried = 0;
  let changed: Area | null = null;

  const to = (nx: number, nz: number): Area | null => {
    // A fresh start dabs where it is: the distance since the last dab counts as a whole step.
    const from = last ?? [nx, nz];
    const along = dabsAlong(from, [nx, nz], step, last ? carried : step);
    last = [nx, nz];
    carried = along.carried;
    let reached: Area | null = null;
    for (const [px, pz] of along.points) reached = unionOf(reached, dab(g, px, pz, brush, target));
    changed = unionOf(changed, reached);
    return reached;
  };
  to(x, z);
  return {
    part,
    brush,
    area: () => changed,
    to,
    lift() {
      last = null;
    },
    undo() {
      if (part === 'heights') g.heights.set(before as Float32Array);
      else changesOf(g, part).set(before);
      const back = changed;
      changed = null;
      return back;
    },
  };
}
