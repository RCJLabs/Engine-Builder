/**
 * Entering a map and arriving at a node (M4.6, docs/specs/maps.md#travel). A layered map is made
 * from a seed drawn from the stream `maps/make` and kept whole; a drawn map is copied as written.
 */
import type { ModuleContext, RecordStore } from '@eb/core';
import { makeLayered } from './layered.ts';
import { kindNames, kindRecord, mapRecord } from './records.ts';
import { bothWays, linksWithin } from './roads.ts';
import type { MadeMap, MapRecord, MapsSlice } from './types.ts';

/** Seeds are drawn below 2^31, so every port holds them in a plain integer. */
const SEED_MAX = 2147483646;

const union = (a: readonly string[], b: Iterable<string>) => [...new Set([...a, ...b])].sort();

function drawnMade(content: RecordStore, map: string, record: MapRecord): MadeMap {
  return {
    map,
    seed: '',
    nodes: (record.nodes ?? []).map((node) => ({
      id: node.id,
      kind: node.kind,
      name: node.name ?? kindRecord(content, node.kind).name,
      layer: 0,
      slot: 0,
    })),
    links: (record.roads ?? []).map((road) => [road.from, road.to] as const),
    start: record.start ?? '',
  };
}

/** The party arrives: it stands on the node, sees around it, is heard, then the kind's and the node's arrivals run. */
export function arrive(ctx: ModuleContext<MapsSlice>, node: string): void {
  const made = ctx.read().made as MadeMap;
  const record = mapRecord(ctx.content, made.map);
  const kind = made.nodes.find((each) => each.id === node)?.kind as string;
  const draft = ctx.write();
  draft.at = node;
  draft.visited = union(draft.visited, [node]);
  draft.known = union(draft.known, [node, ...linksWithin(bothWays(made), node, record.reveal ?? 1).keys()]);
  // Read before any arrival runs: an arrival can enter another map.
  const own = record.nodes?.find((each) => each.id === node)?.arrive ?? [];
  ctx.emit('arrived', { map: made.map, node, kind });
  for (const effect of kindRecord(ctx.content, kind).arrive ?? []) ctx.apply(effect);
  for (const effect of own) ctx.apply(effect);
}

/** Makes the map and puts the party on it, at `at` or its start, as an arrival. */
export function enterMap(ctx: ModuleContext<MapsSlice>, map: unknown, at: unknown): void {
  const record = mapRecord(ctx.content, map);
  const id = map as string;
  const made = record.layers
    ? makeLayered(id, record.layers, kindNames(ctx.content), `${id}/${ctx.rng('make').int(0, SEED_MAX)}`)
    : drawnMade(ctx.content, id, record);
  const start = at === undefined ? made.start : at;
  if (typeof start !== 'string' || !made.nodes.some((node) => node.id === start)) {
    ctx.refuse('no-node', { map: id, node: String(start) });
  }
  const charted = made.nodes.filter((node) => kindRecord(ctx.content, node.kind).charted === true).map((n) => n.id);
  const draft = ctx.write();
  draft.made = made;
  draft.visited = [];
  draft.known = union([], [made.start, ...(made.end === undefined ? [] : [made.end]), ...charted]);
  draft.entered += 1;
  ctx.emit('entered', { map: id });
  arrive(ctx, start as string);
}

/** Every node within `reach` links of the party is known: a scan. */
export function revealMap(ctx: ModuleContext<MapsSlice>, reach: unknown): void {
  const { made, at } = ctx.read();
  if (!made || at === undefined) ctx.refuse('no-map');
  const near = linksWithin(bothWays(made as MadeMap), at as string, typeof reach === 'number' ? reach : 1);
  const draft = ctx.write();
  draft.known = union(draft.known, near.keys());
}
