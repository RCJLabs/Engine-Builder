// The walkers as Space-Wrecked's crew (M7.4, D86): each one a figure in its job's suit
// (data/jobs.json, by the actor's behaviour), trimmed in a crew color of its own, standing
// where stage2d walks it and facing the way it last went, as the fight view makes its
// figures (src/ui/fight/view.js figure). A walker strides a step a tile, as playback.js
// strides a move; reduced motion keeps it standing.
import type { StageWalker } from 'eb/stage';
import { JOBS, WEAPONS } from '../space-wrecked/data/content.ts';
import type { Figure } from '../space-wrecked/render/figures/sprites.ts';
import { crewColor, type Unit, unitsScene } from '../space-wrecked/render/units.ts';

/** Where a walker was last frame, the way it faced and how far it has walked, in tiles. */
interface Walked {
  readonly at: readonly [number, number];
  readonly facing: readonly [number, number];
  readonly walked: number;
}

export interface Crew {
  /** The walkers' figures, or undefined when none moved, turned or stepped since the last. */
  frame(walkers: readonly StageWalker[], still: boolean): Figure[] | undefined;
}

// toBoard: a walker's place in art pixels as a point on the board. records: the pack's, by
// "type:id", where each walker's actor is.
export function createCrew(
  toBoard: (at: readonly [number, number]) => [number, number],
  records: Readonly<Record<string, unknown>>,
): Crew {
  const kept = new Map<string, Walked>();
  let shown = '';
  const jobOf = (actor: string) => {
    const behaviour = (records[`actor:${actor}`] as { behaviour?: string } | undefined)?.behaviour;
    return JOBS[behaviour ?? actor] ?? JOBS[actor];
  };
  return {
    frame(walkers, still) {
      // Each walker its own trim, by its actor's place among them.
      const order = walkers.map((w) => w.actor).sort();
      const units: Unit[] = walkers.map((w) => {
        const at = toBoard(w.at);
        const was = kept.get(w.actor);
        const step = was ? Math.hypot(at[0] - was.at[0], at[1] - was.at[1]) : 0;
        const facing: [number, number] =
          step > 1e-6 && was
            ? [(at[0] - was.at[0]) / step, (at[1] - was.at[1]) / step]
            : ([...(was?.facing ?? [w.facing, 0])] as [number, number]);
        const walked = (was?.walked ?? 0) + step;
        kept.set(w.actor, { at, facing, walked });
        const job = jobOf(w.actor);
        return {
          id: w.actor,
          side: 'crew',
          status: 'active',
          at,
          facing,
          trim: crewColor(order.indexOf(w.actor)),
          ...(job ? { look: job.look, held: WEAPONS[job.weapon]?.held } : {}),
          // A stride is two steps, a step a tile.
          pose: { aim: 0, stride: w.moving && !still ? (walked / 2) % 1 : null },
        };
      });
      // Only what the figures are drawn from: the board keeps its last frame while that stands.
      const key = units
        .map(
          (u) =>
            `${u.id} ${u.at.map((n) => n.toFixed(3))} ${u.facing.map((n) => n.toFixed(2))} ${u.pose?.stride == null ? '-' : Math.round((u.pose.stride as number) * 8)}`,
        )
        .join('|');
      if (key === shown) return undefined;
      shown = key;
      return unitsScene(units).figures;
    },
  };
}
