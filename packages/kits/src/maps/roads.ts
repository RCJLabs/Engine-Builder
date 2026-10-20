/**
 * Where a move reaches (M4.6, docs/specs/maps.md#travel): on a layered map, the nodes within its
 * links, along links that go that way; on a drawn map, every node by road, along the quickest:
 * least time, then least cost, then fewest roads, then node ids (dirtbag's `road()`).
 */
import type { Cost } from '../events/types.ts';
import type { MadeMap, MapRecord, Road } from './types.ts';

/** Each node's neighbours, the way a party can travel: both ways, unless forward or one-way. */
export function neighbours(made: MadeMap, record: MapRecord | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>(made.nodes.map((node) => [node.id, []]));
  const oneWay = new Set(
    (record?.roads ?? []).filter((road) => road['one-way']).map((road) => `${road.from}>${road.to}`),
  );
  for (const [a, b] of made.links) {
    out.get(a)?.push(b);
    if (!made.forward && !oneWay.has(`${a}>${b}`)) out.get(b)?.push(a);
  }
  for (const list of out.values()) list.sort();
  return out;
}

/** Every node within `steps` links of `from`, the way travel goes, with how many links away. */
export function linksWithin(
  next: ReadonlyMap<string, readonly string[]>,
  from: string,
  steps: number,
): Map<string, number> {
  const seen = new Map<string, number>([[from, 0]]);
  let edge = [from];
  for (let step = 1; step <= steps && edge.length > 0; step++) {
    const after: string[] = [];
    for (const node of edge)
      for (const on of next.get(node) ?? [])
        if (!seen.has(on)) {
          seen.set(on, step);
          after.push(on);
        }
    edge = after;
  }
  seen.delete(from);
  return seen;
}

/** Links read both ways, as a scan or the party's sight sees them. */
export function bothWays(made: MadeMap): Map<string, string[]> {
  const { forward: _, ...both } = made;
  return neighbours(both, undefined);
}

export interface Route {
  /** The nodes from the start to the end, both in. */
  readonly path: readonly string[];
  readonly roads: readonly Road[];
  readonly ticks: number;
  readonly cost: number;
}

const costOf = (cost: Cost | undefined) => Object.values(cost ?? {}).reduce((sum, n) => sum + n, 0);

/** Whether a route is quicker: time, then cost, then roads, then the ids along it. */
function better(a: Route, b: Route): boolean {
  if (a.ticks !== b.ticks) return a.ticks < b.ticks;
  if (a.cost !== b.cost) return a.cost < b.cost;
  if (a.roads.length !== b.roads.length) return a.roads.length < b.roads.length;
  return a.path.join(' ') < b.path.join(' ');
}

/** The road between two nodes the way travel goes, if there is one: the first so written. */
function roadBetween(record: MapRecord, from: string, to: string): Road | undefined {
  return (record.roads ?? []).find(
    (road) => (road.from === from && road.to === to) || (!road['one-way'] && road.from === to && road.to === from),
  );
}

/** The quickest route by road from one node to every other it reaches. `ticks` turns a road's time into ticks. */
export function quickest(record: MapRecord, from: string, ticks: (road: Road) => number): Map<string, Route> {
  const next = neighbours(
    {
      map: '',
      seed: '',
      nodes: (record.nodes ?? []).map((n) => ({ id: n.id, kind: n.kind, name: '', layer: 0, slot: 0 })),
      links: (record.roads ?? []).map((road) => [road.from, road.to] as const),
      start: record.start ?? '',
    },
    record,
  );
  const best = new Map<string, Route>([[from, { path: [from], roads: [], ticks: 0, cost: 0 }]]);
  const done = new Set<string>();
  for (;;) {
    let at: [string, Route] | undefined;
    for (const entry of best) if (!done.has(entry[0]) && (!at || better(entry[1], at[1]))) at = entry;
    if (!at) break;
    const [node, route] = at;
    done.add(node);
    for (const on of next.get(node) ?? []) {
      if (done.has(on)) continue;
      const road = roadBetween(record, node, on) as Road;
      const tried: Route = {
        path: [...route.path, on],
        roads: [...route.roads, road],
        ticks: route.ticks + ticks(road),
        cost: route.cost + costOf(road.cost),
      };
      const held = best.get(on);
      if (!held || better(tried, held)) best.set(on, tried);
    }
  }
  best.delete(from);
  return best;
}
