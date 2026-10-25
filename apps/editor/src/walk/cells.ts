/**
 * The walk's cells (M5.10, D72, docs/specs/streaming.md#cells): which 64 m squares each top-level
 * object's footprint touches, and from where the player stands, what is near, what is kept and what
 * is far. Plain arithmetic, so Node's tests stream a space as the page does.
 */

/** A cell's side, in metres. */
export const CELL = 64;
/** Cells either side of the player's that are built: the 3×3. */
export const NEAR = 1;
/** Cells either side within which what is built stays built: the 5×5. */
export const KEPT = 2;

export type Cell = readonly [number, number];

/** A top-level object's place on x and z, and how far from it anything of it reaches. */
export interface Footprint {
  readonly id: string;
  readonly at: readonly [number, number];
  readonly reach: number;
}

export const cellOf = (x: number, z: number): Cell => [Math.floor(x / CELL), Math.floor(z / CELL)];

const keyOf = (i: number, j: number) => `${i},${j}`;

/** How many cells apart two cells are, the larger of the two ways. */
export const apart = (a: Cell, b: Cell): number => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

/** Each cell the footprint's box touches, on x and z: its place, its reach either side. */
export function cellsOf(footprint: Footprint): Cell[] {
  const { at, reach } = footprint;
  const [lo, hi] = [cellOf(at[0] - reach, at[1] - reach), cellOf(at[0] + reach, at[1] + reach)];
  const cells: Cell[] = [];
  for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) cells.push([i, j]);
  return cells;
}

/** The objects in each cell, by the cell's key, each list in the order the space's file has them. */
export type CellIndex = ReadonlyMap<string, readonly string[]>;

export function indexOf(footprints: readonly Footprint[]): CellIndex {
  const index = new Map<string, string[]>();
  for (const footprint of footprints) {
    for (const [i, j] of cellsOf(footprint)) {
      const key = keyOf(i, j);
      const list = index.get(key);
      if (list) list.push(footprint.id);
      else index.set(key, [footprint.id]);
    }
  }
  return index;
}

/**
 * What is near the player in `at`: every object with a cell within NEAR of it, and of those already
 * `built`, every one with a cell within KEPT, so a walk along a cell's edge builds nothing twice.
 */
export function nearOf(index: CellIndex, at: Cell, built: ReadonlySet<string>): Set<string> {
  const near = new Set<string>();
  for (let i = at[0] - KEPT; i <= at[0] + KEPT; i++) {
    for (let j = at[1] - KEPT; j <= at[1] + KEPT; j++) {
      const ids = index.get(keyOf(i, j));
      if (!ids) continue;
      const ring = apart([i, j], at) <= NEAR;
      for (const id of ids) if (ring || built.has(id)) near.add(id);
    }
  }
  return near;
}

/** How far the footprint's edge is from a point on x and z: 0 inside it. */
export const distanceTo = (footprint: Footprint, x: number, z: number): number =>
  Math.max(0, Math.hypot(footprint.at[0] - x, footprint.at[1] - z) - footprint.reach);

/** The objects not near whose footprints come within `view` metres of the point: what draws far. */
export function farOf(
  footprints: readonly Footprint[],
  x: number,
  z: number,
  view: number,
  near: ReadonlySet<string>,
): string[] {
  return footprints.filter((f) => !near.has(f.id) && distanceTo(f, x, z) <= view).map((f) => f.id);
}
