/**
 * Travel on a map (M4.6, D56, docs/specs/maps.md#travel). What a move costs is one function,
 * travelOf, that the action, its options and the widget all read, so the cost on screen is the
 * cost paid. Taking it pays, runs the move's effects, waits, then arrives.
 */
import type { Calendar, Condition, ModuleContext, RecordStore } from '@eb/core';
import { ticksOf } from '@eb/core';
import { type Choosing, type Short, shortOf } from '../events/choices.ts';
import type { Cost } from '../events/types.ts';
import { mapRecord } from './records.ts';
import { linksWithin, neighbours, quickest, roadBetween } from './roads.ts';
import type { MapRecord, MapsSlice, Move, Road, Takes } from './types.ts';

export interface Travel {
  readonly move: Move;
  readonly to: string;
  /** The nodes from the party's to `to`, both in: a layered map's move skips what it passes. */
  readonly path: readonly string[];
  readonly cost: Cost;
  readonly takes: Takes;
}

export type TravelVerdict =
  | { readonly ok: true; readonly travel: Travel }
  | { readonly ok: false; readonly reason: 'locked'; readonly travel: Travel }
  | { readonly ok: false; readonly reason: 'cant-afford'; readonly travel: Travel; readonly short: Short };

/** What the kit is built knowing: whether costs are charged, and the calendar when time is on. */
export interface Built {
  readonly economy: boolean;
  readonly calendar?: Calendar;
}

/** Adds counts by key: a move's cost and each road's, or its time and each road's. */
function summed(parts: readonly (Readonly<Record<string, number>> | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of parts)
    for (const [key, n] of Object.entries(part ?? {}))
      out[key] = (Object.hasOwn(out, key) ? (out[key] as number) : 0) + n;
  return out;
}

/** A road's time in ticks, or none without the time kit (W120). */
const roadTicks = (built: Built) => (road: Road) =>
  built.calendar && road.takes ? ticksOf(built.calendar, road.takes) : 0;

/** Every node a move reaches from the party's, with the path there. */
function reached(
  record: MapRecord,
  slice: Readonly<MapsSlice>,
  move: Move,
  built: Built,
): Map<string, readonly string[]> {
  const { made, at } = slice;
  if (!made || at === undefined) return new Map();
  if (record.layers) {
    const near = linksWithin(neighbours(made, record), at, move.reach ?? 1);
    return new Map([...near.keys()].map((to) => [to, [at, to]]));
  }
  return new Map([...quickest(record, at, roadTicks(built))].map(([to, route]) => [to, route.path]));
}

/** The move's travel to a node, or undefined when the move or the node is out of reach. */
export function travelOf(
  content: RecordStore,
  slice: Readonly<MapsSlice>,
  moveId: unknown,
  to: unknown,
  built: Built,
): Travel | undefined {
  if (!slice.made || typeof to !== 'string') return undefined;
  const record = mapRecord(content, slice.made.map);
  const move = record.moves.find((each) => each.id === moveId);
  if (!move) return undefined;
  const path = reached(record, slice, move, built).get(to);
  if (!path) return undefined;
  const roads = record.layers ? [] : roadsAlong(record, path, roadTicks(built));
  return {
    move,
    to,
    path,
    cost: summed([move.cost, ...roads.map((road) => road.cost)]),
    takes: summed([move.takes, ...roads.map((road) => road.takes)]),
  };
}

/** The roads a path takes, each the one quickest choosing picked. */
function roadsAlong(record: MapRecord, path: readonly string[], ticks: (road: Road) => number): Road[] {
  const roads: Road[] = [];
  for (let i = 1; i < path.length; i++) {
    const road = roadBetween(record, path[i - 1] as string, path[i] as string, ticks);
    if (road) roads.push(road);
  }
  return roads;
}

/** Every travel the party could take now, move by move in their order, nodes by id. */
export function travels(content: RecordStore, slice: Readonly<MapsSlice>, built: Built): Travel[] {
  if (!slice.made) return [];
  const record = mapRecord(content, slice.made.map);
  return record.moves.flatMap((move) =>
    [...reached(record, slice, move, built).keys()]
      .sort()
      .map((to) => travelOf(content, slice, move.id, to, built) as Travel),
  );
}

const holds = (choosing: Choosing, condition: Condition | undefined) =>
  condition === undefined || choosing.check(condition) === true;

/** Whether a travel can be taken now: its move's `if` held and its cost paid, as the events kit judges a choice. */
export function travelVerdict(choosing: Choosing, travel: Travel): TravelVerdict {
  if (!holds(choosing, travel.move.if)) return { ok: false, reason: 'locked', travel };
  const short = shortOf(choosing, Object.keys(travel.cost).length > 0 ? travel.cost : undefined);
  if (short) return { ok: false, reason: 'cant-afford', travel, short };
  return { ok: true, travel };
}

/** Takes a travel: pays, runs the move's effects, waits what it takes; the arrival is the caller's. */
export function setOff(ctx: ModuleContext<MapsSlice>, travel: Travel, built: Built): void {
  if (built.economy && Object.keys(travel.cost).length > 0) ctx.apply({ effect: 'pay-cost', cost: travel.cost });
  for (const effect of travel.move.effects ?? []) ctx.apply(effect);
  if (built.calendar && Object.values(travel.takes).some((n) => n > 0)) ctx.apply({ effect: 'wait', ...travel.takes });
}
