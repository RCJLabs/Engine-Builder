/** The maps kit's records and slice (M4.6, D56, docs/specs/maps.md). */
import type { Condition, Effect } from '@eb/core';
import type { Cost } from '../events/types.ts';

export const MAPS = 'maps';
export const MAP = 'map';
export const NODE_KIND = 'node-kind';

/** A duration in the calendar's units: `{ "days": 1 }`, `{ "hours": 3 }`. */
export type Takes = Readonly<Record<string, number>>;

export interface NodeKindRecord {
  readonly name: string;
  readonly description?: string;
  /** Names given to nodes of this kind, shuffled, none twice in a map. */
  readonly names?: readonly string[];
  /** Known from the moment the map is entered. */
  readonly charted?: boolean;
  readonly arrive?: readonly Effect[];
}

/** A kind placed first, by count, inside its layers. */
export interface PlaceRule {
  readonly kind: string;
  readonly min: number;
  readonly max: number;
  readonly from?: number;
  readonly to?: number;
  /** None two in a layer. */
  readonly apart?: boolean;
  /** Never the only link on from a node of the layer before. */
  readonly avoidable?: boolean;
}

/** A kind every other node is rolled from, by weight, inside its layers. */
export interface MixEntry {
  readonly kind: string;
  readonly weight: number;
  readonly from?: number;
  readonly to?: number;
}

export interface LayerRules {
  /** Layers, the start's and the end's among them. */
  readonly count: number;
  readonly widths: { readonly min: number; readonly max: number };
  readonly start: string;
  readonly end: string;
  readonly links: 'both' | 'forward';
  /** Percent chance of an extra link between each pair of layers. */
  readonly extra?: number;
  readonly place?: readonly PlaceRule[];
  readonly mix: readonly MixEntry[];
}

export interface DrawnNode {
  readonly id: string;
  readonly name?: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly arrive?: readonly Effect[];
}

export interface Road {
  readonly from: string;
  readonly to: string;
  readonly takes?: Takes;
  readonly cost?: Cost;
  readonly 'one-way'?: boolean;
}

export interface Move {
  readonly id: string;
  readonly label: string;
  /** Links away, on a layered map. */
  readonly reach?: number;
  readonly cost?: Cost;
  readonly takes?: Takes;
  /** Run as the party sets off. */
  readonly effects?: readonly Effect[];
  readonly if?: Condition;
}

export interface MapRecord {
  readonly name: string;
  readonly description?: string;
  readonly layers?: LayerRules;
  readonly nodes?: readonly DrawnNode[];
  readonly roads?: readonly Road[];
  readonly start?: string;
  readonly moves: readonly Move[];
  /** Links from a node the party has stood on that are known; 1 if left out. */
  readonly reveal?: number;
}

export interface MadeNode {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly layer: number;
  readonly slot: number;
}

/**
 * A map as the party travels it, saved whole: a change to its rules never moves a node under a
 * save. A drawn map's links are its roads, whose one-way, time and cost its record keeps.
 */
export interface MadeMap {
  readonly map: string;
  /** A layered map's seed; empty for a drawn map. */
  readonly seed: string;
  readonly nodes: readonly MadeNode[];
  readonly links: readonly (readonly [string, string])[];
  /** A layered map whose links go only towards the end. */
  readonly forward?: true;
  readonly start: string;
  readonly end?: string;
}

/** The kit's slice, as a handler writes it; read() gives it read-only. */
export interface MapsSlice {
  /** The map the party is on; left out before the first. */
  made?: MadeMap;
  at?: string;
  /** On this map, sorted. */
  visited: string[];
  /** On this map, sorted. */
  known: string[];
  /** Maps entered in the game. */
  entered: number;
}

/** What the generator reads of a kind: its name and the names it gives. */
export type KindNames = (kind: string) => { readonly name: string; readonly names?: readonly string[] };
