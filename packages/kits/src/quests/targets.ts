/**
 * Where an objective's marker points (M6.6, D78, docs/specs/markers.md#targets): its `target` as
 * written, else one read from its count, so the marker and the test are one definition: a count of
 * `world/used` with a space and an object is that object, one of `fighting/searched` with an actor
 * that actor. A done-when says anything, so it is never read.
 */
import type { Objective, Target } from './types.ts';

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** The objective's target, written or read from its count, its slots not yet bound. */
export function targetOf(objective: Objective): Target | undefined {
  if (objective.target !== undefined) return objective.target;
  const { event, args } = objective.count ?? {};
  if (event === 'world/used' && isText(args?.space) && isText(args?.object)) {
    return { space: args.space, object: args.object };
  }
  if (event === 'fighting/searched' && isText(args?.actor)) return { actor: args.actor };
  return undefined;
}
