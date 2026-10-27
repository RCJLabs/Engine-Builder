/**
 * Routes through a building (M7.3, D85, docs/specs/rooms.md#routes; from afterglass's route in
 * prototype/src/slice/geo.js:155-199, without its lights and wards): Dijkstra by a linear scan over the
 * start, both ends of every stair and the goal, in that order. Walking along a floor costs the distance;
 * a climb costs the building's climb. The cheapest point is taken next, the lowest-numbered of equal ones,
 * and a cost replaces another only when strictly lower, so a route is the same every time. Whole numbers
 * throughout, where afterglass's are floats.
 */
import type { PackBuilding, Place } from './building.ts';

/**
 * The places a walker turns at from `from` to `to`, both included: along a floor to a stair's end, up or
 * down it, and so on. A place equal to the one before is left out, as where the start is at a stair.
 * Null when `to` can't be reached.
 */
export function buildingRoute(
  building: Pick<PackBuilding, 'floors' | 'climb' | 'stairs'>,
  from: Place,
  to: Place,
): Place[] | null {
  const inside = ([floor]: Place) => floor >= 0 && floor < building.floors;
  if (!inside(from) || !inside(to)) return null;
  // The points: the start, each stair's foot and head, and the goal.
  const points: Place[] = [from];
  for (const [floor, x] of building.stairs) points.push([floor, x], [floor + 1, x]);
  points.push(to);
  const goal = points.length - 1;
  // A point's cost so far, -1 while unreached; the point it was reached from; whether it is settled.
  const cost = new Array<number>(points.length).fill(-1);
  const came = new Array<number>(points.length).fill(-1);
  const done = new Array<boolean>(points.length).fill(false);
  cost[0] = 0;
  for (;;) {
    const here = cheapest(cost, done);
    if (here === -1 || here === goal) break;
    done[here] = true;
    const [floor, x] = points[here] as Place;
    for (let next = 0; next < points.length; next++) {
      if (done[next]) continue;
      const [f, nx] = points[next] as Place;
      // Up or down the stair this point is an end of, or along the floor.
      const climbs = here > 0 && next > 0 && next < goal && stairOf(here) === stairOf(next);
      const step = climbs ? building.climb : f === floor ? Math.abs(nx - x) : -1;
      if (step === -1) continue;
      const total = (cost[here] as number) + step;
      if (cost[next] === -1 || total < (cost[next] as number)) {
        cost[next] = total;
        came[next] = here;
      }
    }
  }
  if (cost[goal] === -1) return null;
  const route: Place[] = [];
  for (let at = goal; at !== -1; at = came[at] as number) {
    const place = points[at] as Place;
    const last = route[route.length - 1];
    if (last === undefined || last[0] !== place[0] || last[1] !== place[1]) route.push(place);
  }
  return route.reverse();
}

/** The unsettled point that costs least so far, the lowest-numbered of equal ones; -1 when none is reached. */
function cheapest(cost: readonly number[], done: readonly boolean[]): number {
  let best = -1;
  for (let i = 0; i < cost.length; i++) {
    const c = cost[i] as number;
    if (!done[i] && c !== -1 && (best === -1 || c < (cost[best] as number))) best = i;
  }
  return best;
}

/** Which stair a point other than the start and the goal is an end of. */
const stairOf = (point: number) => Math.floor((point - 1) / 2);

/** What a route costs, walked: the distances along floors and a climb for each change of floor. */
export function routeCost(building: Pick<PackBuilding, 'climb'>, route: readonly Place[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    const [f0, x0] = route[i - 1] as Place;
    const [f1, x1] = route[i] as Place;
    total += f0 === f1 ? Math.abs(x1 - x0) : building.climb * Math.abs(f1 - f0);
  }
  return total;
}
