/**
 * The map as the party sees it (M4.6, docs/specs/maps.md#the-map-widget): enter-map's preview of
 * the map the party is on, as start-quest's is the quest's journal. Every node and link is drawn;
 * a node not yet known shows no kind or name. Each travel carries travelOf's cost and time,
 * travelVerdict's verdict and its move's effects' previews, so what the widget shows is what the
 * action charges, accepts and does.
 */
import type { Condition, Effect, EffectPreview } from '@eb/core';
import type { Choosing, Short } from '../events/choices.ts';
import type { Cost } from '../events/types.ts';
import { mapRecord } from './records.ts';
import { type Built, travels, travelVerdict } from './travel.ts';
import type { MapsSlice, Takes } from './types.ts';

export interface NodeShown {
  readonly id: string;
  readonly layer: number;
  readonly slot: number;
  /** A drawn map's place, 0 to 100 each way, from its record. */
  readonly x?: number;
  readonly y?: number;
  readonly known: boolean;
  readonly visited: boolean;
  /** A known node's name and kind. */
  readonly name?: string;
  readonly kind?: string;
}

export interface LinkShown {
  readonly from: string;
  readonly to: string;
  /** A drawn map's one-way road, or any link of a forward map: only from `from` to `to`. */
  readonly oneWay: boolean;
}

export interface TravelShown {
  readonly move: string;
  readonly label: string;
  readonly to: string;
  /** Empty without the economy kit, which alone charges it. */
  readonly cost: Cost;
  /** Empty without the time kit, which alone makes it pass. */
  readonly takes: Takes;
  /** Each of the move's effects as its preview gives it, from the state now: a flag's from and to. */
  readonly changes: readonly EffectPreview[];
  readonly ok: boolean;
  /** The move's `if`, while it doesn't hold. */
  readonly needs?: Condition;
  readonly short?: Short;
}

export type MapShown =
  | { readonly map: string; readonly on: false }
  | {
      readonly map: string;
      readonly on: true;
      readonly name: string;
      readonly shape: 'layered' | 'drawn';
      /** A layered map's layers, its start's and end's among them; 1 on a drawn map. */
      readonly layers: number;
      readonly at: string;
      readonly nodes: readonly NodeShown[];
      readonly links: readonly LinkShown[];
      readonly travels: readonly TravelShown[];
    };

type Preview = (effect: Effect) => EffectPreview;

function travelsShown(choosing: Choosing, slice: Readonly<MapsSlice>, built: Built, preview: Preview): TravelShown[] {
  return travels(choosing.content, slice, built).map((travel) => {
    const verdict = travelVerdict(choosing, travel);
    const locked = verdict.ok
      ? {}
      : verdict.reason === 'locked'
        ? travel.move.if === undefined
          ? {}
          : { needs: travel.move.if }
        : { short: verdict.short };
    return {
      move: travel.move.id,
      label: travel.move.label,
      to: travel.to,
      cost: built.economy ? travel.cost : {},
      takes: built.calendar ? travel.takes : {},
      changes: (travel.move.effects ?? []).map(preview),
      ok: verdict.ok,
      ...locked,
    };
  });
}

/** The map the party is on as it sees it, or `on: false` for any other map: a preview can't make one. */
export function mapShown(
  choosing: Choosing,
  slice: Readonly<MapsSlice>,
  built: Built,
  map: string,
  preview: Preview,
): MapShown {
  const { made, at } = slice;
  if (!made || made.map !== map || at === undefined) return { map, on: false };
  const record = mapRecord(choosing.content, map);
  const known = new Set(slice.known);
  const visited = new Set(slice.visited);
  const placed = new Map((record.nodes ?? []).map((node) => [node.id, node]));
  const oneWay = new Set(
    (record.roads ?? []).filter((road) => road['one-way']).map((road) => `${road.from}>${road.to}`),
  );
  return {
    map,
    on: true,
    name: record.name,
    shape: record.layers ? 'layered' : 'drawn',
    layers: made.nodes.reduce((most, node) => Math.max(most, node.layer + 1), 1),
    at,
    nodes: made.nodes.map((node) => {
      const place = placed.get(node.id);
      return {
        id: node.id,
        layer: node.layer,
        slot: node.slot,
        ...(place ? { x: place.x, y: place.y } : {}),
        known: known.has(node.id),
        visited: visited.has(node.id),
        ...(known.has(node.id) ? { name: node.name, kind: node.kind } : {}),
      };
    }),
    links: made.links.map(([from, to]) => ({
      from,
      to,
      oneWay: made.forward === true || oneWay.has(`${from}>${to}`),
    })),
    travels: travelsShown(choosing, slice, built, preview),
  };
}
