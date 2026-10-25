/**
 * The walk's rings as the player moves (M5.10, D72, docs/specs/streaming.md#the-rings): each time
 * they cross into another cell, what is near (built whole: drawn, solid, its zones heard and its uses
 * offered), what comes and goes, and what is far (its models drawn alone). No three or Rapier here:
 * the stage hands the solids to the walker and the rest to the view, the zones and the acts.
 */
import { type Cell, cellOf, distanceTo, type Footprint, farOf, indexOf, nearOf } from './cells.ts';
import { topOf, type Walker } from './physics.ts';
import { isTaken, type Parts, type Solid, type UsePoint, type Zone } from './solids.ts';

export interface Ring {
  readonly cell: Cell;
  /** The objects built, in the space's order. */
  readonly near: ReadonlySet<string>;
  /** The objects this ring builds, nearest first. */
  readonly added: readonly string[];
  /** The objects it takes down. */
  readonly gone: readonly string[];
  /** The solids of what it builds, those taken left out. */
  readonly solids: readonly Solid[];
  /** The objects drawn far: their models only. */
  readonly far: readonly string[];
  /** How far the farthest of them is, by its footprint's edge: never past the view distance. */
  readonly farthest: number;
  readonly zones: readonly Zone[];
  readonly uses: readonly UsePoint[];
}

export interface Streamer {
  /** Where the player stands now: the new ring once it is another cell, or the view changed; else null. */
  at(x: number, z: number, taken: ReadonlySet<string>): Ring | null;
  /** The view distance, in metres: the next at() works the far objects out again. */
  view(metres: number): void;
  readonly ring: Ring | null;
}

/** Each part list by the top-level object it is in, keeping its order. */
function byTop<T extends { readonly path: string }>(parts: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const part of parts) {
    const top = topOf(part.path);
    const list = out.get(top);
    if (list) list.push(part);
    else out.set(top, [part]);
  }
  return out;
}

export function createStreamer(parts: Parts, footprints: readonly Footprint[], view: number): Streamer {
  const index = indexOf(footprints);
  const order = footprints.map((f) => f.id);
  const footprint = new Map(footprints.map((f) => [f.id, f]));
  const [solids, zones, uses] = [byTop(parts.solids), byTop(parts.zones), byTop(parts.uses)];
  let ring: Ring | null = null;
  let distance = view;
  let stale = true;
  const of = <T>(map: ReadonlyMap<string, T[]>, ids: Iterable<string>) => [...ids].flatMap((id) => map.get(id) ?? []);

  return {
    at(x, z, taken) {
      const cell = cellOf(x, z);
      if (ring && !stale && ring.cell[0] === cell[0] && ring.cell[1] === cell[1]) return null;
      stale = false;
      const was = ring?.near ?? new Set<string>();
      const found = nearOf(index, cell, was);
      // Kept in the space's order, so zones and uses come in the order the file has them.
      const near = new Set(order.filter((id) => found.has(id)));
      const nearest = (a: string, b: string) =>
        distanceTo(footprint.get(a) as Footprint, x, z) - distanceTo(footprint.get(b) as Footprint, x, z);
      const added = [...near].filter((id) => !was.has(id)).sort(nearest);
      const far = farOf(footprints, x, z, distance, near);
      ring = {
        cell,
        near,
        added,
        gone: [...was].filter((id) => !near.has(id)),
        solids: of(solids, added).filter((s) => !isTaken(s.path, taken)),
        far,
        farthest: Math.max(0, ...far.map((id) => distanceTo(footprint.get(id) as Footprint, x, z))),
        zones: of(zones, near),
        uses: of(uses, near),
      };
      return ring;
    },
    view(metres) {
      if (metres !== distance) stale = true;
      distance = metres;
    },
    get ring() {
      return ring;
    },
  };
}

/** A ring's solids into the walker's world, and what it took down out of it. */
export function applyRing(walker: Pick<Walker, 'add' | 'drop'>, ring: Ring): void {
  walker.drop(new Set(ring.gone));
  walker.add(ring.solids);
}
