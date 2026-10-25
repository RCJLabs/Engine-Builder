/**
 * The rings put to work (M5.10, D72, docs/specs/streaming.md#building): each ring the streamer
 * works out goes to the walker's world at once, to the zones and the uses, and to the view, which
 * draws its near objects a few a frame and its far ones' models. A player put far from where they
 * were, by a respawn, has the ring around them built whole before the next step.
 */
import type { Acts } from './acts.ts';
import { apart, NEAR } from './cells.ts';
import type { Placement } from './footprints.ts';
import type { WalkCells } from './hook.ts';
import type { Walker } from './physics.ts';
import type { Sender } from './sender.ts';
import { isTaken } from './solids.ts';
import { applyRing, type Ring, type Streamer } from './streamer.ts';
import type { WalkView } from './view.ts';
import type { WalkSpace } from './world.ts';

export interface Streaming {
  /** After each fixed step, with the feet where it left them. */
  step(x: number, z: number, taken: ReadonlySet<string>): void;
  /** A new view, at a tier's view distance: everything near drawn on it again, and the far. */
  redraw(view: number, x: number, z: number, taken: ReadonlySet<string>): void;
  cells(): WalkCells;
}

export function createStreaming(
  space: WalkSpace,
  streamer: Streamer,
  first: Ring,
  to: { readonly walker: Walker; readonly sender: Sender; readonly acts: Acts; view(): WalkView },
  view: number,
  taken: ReadonlySet<string>,
): Streaming {
  const placements = new Map<string, Placement[]>();
  for (const p of space.streamed.placements) {
    const list = placements.get(p.top);
    if (list) list.push(p);
    else placements.set(p.top, [p]);
  }
  let ring = first;
  let distance = view;

  const show = (next: Ring, order: readonly string[], whole: boolean, taken: ReadonlySet<string>) => {
    const drawn = to.view();
    drawn.near(next.near, order);
    const far = next.far.flatMap((id) => placements.get(id) ?? []).filter((p) => !isTaken(p.path, taken));
    drawn.far(
      far,
      next.far.filter((id) => space.streamed.water.has(id)),
    );
    to.sender.zones(next.zones);
    to.acts.uses(next.uses);
    if (whole) drawn.settle();
  };
  show(first, first.added, true, taken);

  return {
    step(x, z, taken) {
      const next = streamer.at(x, z, taken);
      if (!next) return;
      applyRing(to.walker, next);
      const far = apart(next.cell, ring.cell) > NEAR;
      ring = next;
      show(next, next.added, far, taken);
    },
    redraw(next, x, z, taken) {
      distance = next;
      streamer.view(next);
      ring = streamer.at(x, z, taken) ?? ring;
      show(ring, [...ring.near], true, taken);
    },
    cells() {
      const drawn = to.view().streaming();
      return {
        cell: [ring.cell[0], ring.cell[1]],
        near: [...ring.near].sort(),
        waiting: drawn.waiting,
        far: drawn.far,
        bodies: to.walker.bodies(),
        zones: to.sender.heard,
        uses: to.acts.offered,
        view: distance,
        farthest: ring.farthest,
        slowest: drawn.slowest,
        drawn: drawn.built,
      };
    },
  };
}
