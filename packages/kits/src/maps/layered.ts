/**
 * The layered map generator (M4.6, D56, docs/specs/maps.md#the-generator): a start, layers of
 * nodes and an end, links that never cross between neighbouring layers, and kinds placed by rule,
 * then rolled from a mix. Valid by construction, never retried: the check over seeds (sweep.ts)
 * finds what a map's rules can't always keep. The links are space-wrecked's (`gen/sector.js`).
 */
import { Rng } from '@eb/core';
import type { KindNames, LayerRules, MadeMap, MadeNode, MixEntry, PlaceRule } from './types.ts';

/** A node's slot in the next layer at the same relative height; a layer of one looks to the middle. */
export function along(i: number, n: number, m: number): number {
  if (n === 1) return Math.floor((m - 1) / 2);
  return Math.round((i * (m - 1)) / (n - 1));
}

/** Two links between the same layers cross when their ends are in opposite orders. */
export const crosses = (a: readonly [number, number], b: readonly [number, number]): boolean =>
  (a[0] - b[0]) * (a[1] - b[1]) < 0;

export const nodeId = (layer: number, slot: number): string => `n${layer}-${slot}`;

/** The links between a layer of `n` and the next of `m`, as slot pairs, each way's first, then any extra. */
function gapLinks(rng: Rng, n: number, m: number, extra: number): [number, number][] {
  const links: [number, number][] = [];
  const add = (pair: [number, number]) => {
    if (!links.some(([a, b]) => a === pair[0] && b === pair[1])) links.push(pair);
  };
  for (let i = 0; i < n; i++) add([i, along(i, n, m)]);
  for (let j = 0; j < m; j++) add([along(j, m, n), j]);
  if (extra > 0 && rng.int(1, 100) <= extra) {
    const free: [number, number][] = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) {
        const pair: [number, number] = [i, j];
        if (!links.some(([a, b]) => a === i && b === j) && !links.some((link) => crosses(link, pair))) free.push(pair);
      }
    if (free.length > 0) links.push(free[rng.int(0, free.length - 1)] as [number, number]);
  }
  return links.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

interface Slot {
  readonly layer: number;
  readonly slot: number;
}

/** Whether a slot is the only way on from some node of the layer before. */
function onlyWayOn(at: Slot, gaps: readonly (readonly [number, number])[][]): boolean {
  const gap = gaps[at.layer - 1] ?? [];
  const parents = gap.filter(([, b]) => b === at.slot).map(([a]) => a);
  return parents.some((parent) => gap.filter(([a]) => a === parent).length === 1);
}

const inside = (layer: number, rule: { readonly from?: number; readonly to?: number }, last: number) =>
  layer >= (rule.from ?? 1) && layer <= (rule.to ?? last);

/** Places one rule's kind, as many as it rolls, on the free slots its layers and rules allow. */
function place(
  rng: Rng,
  rule: PlaceRule,
  free: Slot[],
  kinds: Map<string, string>,
  gaps: [number, number][][],
  last: number,
) {
  const count = rng.int(rule.min, rule.max);
  for (let n = 0; n < count; n++) {
    const taken = new Set(
      [...kinds].filter(([, kind]) => kind === rule.kind).map(([key]) => Number(key.split('-')[0])),
    );
    const fits = free.filter(
      (at) =>
        inside(at.layer, rule, last) &&
        !(rule.apart && taken.has(at.layer)) &&
        !(rule.avoidable && onlyWayOn(at, gaps)),
    );
    if (fits.length === 0) return;
    const at = fits[rng.int(0, fits.length - 1)] as Slot;
    kinds.set(`${at.layer}-${at.slot}`, rule.kind);
    free.splice(free.indexOf(at), 1);
  }
}

/** The mix's entries for a layer, in their written order. */
const mixFor = (mix: readonly MixEntry[], layer: number, last: number) =>
  mix.filter((entry) => inside(layer, entry, last));

/** Each node's name: its kind's names, shuffled once a map, then the kind's name, then numbered from 2. */
function namer(rng: Rng, kindNames: KindNames) {
  const queues = new Map<string, string[]>();
  const counts = new Map<string, number>();
  return (kind: string): string => {
    const { name, names = [] } = kindNames(kind);
    if (!queues.has(kind)) queues.set(kind, names.length > 0 ? rng.shuffle(names) : []);
    const queue = queues.get(kind) as string[];
    if (queue.length > 0) return queue.shift() as string;
    const count = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, count);
    return count === 1 ? name : `${name} ${count}`;
  };
}

/** The map its rules make from a seed: the same seed always makes the same map. */
export function makeLayered(map: string, rules: LayerRules, kindNames: KindNames, seed: string): MadeMap {
  const rng = Rng.create(seed);
  const last = rules.count - 1;
  const widths = [1];
  for (let layer = 1; layer < last; layer++) widths.push(rng.int(rules.widths.min, rules.widths.max));
  widths.push(1);
  const gaps: [number, number][][] = [];
  for (let layer = 0; layer < last; layer++)
    gaps.push(gapLinks(rng, widths[layer] as number, widths[layer + 1] as number, rules.extra ?? 0));

  const kinds = new Map<string, string>([
    ['0-0', rules.start],
    [`${last}-0`, rules.end],
  ]);
  const free: Slot[] = [];
  for (let layer = 1; layer < last; layer++)
    for (let slot = 0; slot < (widths[layer] as number); slot++) free.push({ layer, slot });
  for (const rule of rules.place ?? []) place(rng, rule, free, kinds, gaps, last - 1);
  for (const at of free) {
    const entries = mixFor(rules.mix, at.layer, last - 1);
    if (entries.length === 0) throw new Error(`No kind in the mix for layer ${at.layer}`);
    kinds.set(`${at.layer}-${at.slot}`, (entries[rng.weightedIndex(entries.map((e) => e.weight))] as MixEntry).kind);
  }

  const name = namer(rng, kindNames);
  const nodes: MadeNode[] = [];
  for (let layer = 0; layer <= last; layer++)
    for (let slot = 0; slot < (widths[layer] as number); slot++) {
      const kind = kinds.get(`${layer}-${slot}`) as string;
      nodes.push({ id: nodeId(layer, slot), kind, name: name(kind), layer, slot });
    }
  const links = gaps.flatMap((gap, layer) => gap.map(([a, b]) => [nodeId(layer, a), nodeId(layer + 1, b)] as const));
  const forward = rules.links === 'forward' ? { forward: true as const } : {};
  return { map, seed, nodes, links, ...forward, start: nodeId(0, 0), end: nodeId(last, 0) };
}
