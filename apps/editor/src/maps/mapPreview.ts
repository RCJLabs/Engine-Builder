/**
 * What the preview above a map's form draws (M4.6, D56, docs/specs/maps.md#the-editor), as plain
 * functions: a layered map made from a seed, or a drawn map as written, as the map widget's view
 * with everything known; and the check over 300 seeds, rule by rule in words. The seeds are the
 * sweep's own, "1" to "300", so a rule's first broken seed opens the map that broke it.
 */
import {
  type KindNames,
  type LayerRules,
  type MadeMap,
  type MapRecord,
  makeLayered,
  type RuleCheck,
  SWEEP_SEEDS,
  sweepLayered,
} from '@eb/kits';
import type { MapNode, MapView } from '@eb/ui/session';

/** What the preview reads of a node kind: its name, the names it gives and what the map says of it. */
export interface KindShown {
  readonly name: string;
  readonly names?: readonly string[];
  readonly description?: string;
}
export type Kinds = (kind: string) => KindShown | undefined;

const namesOf =
  (kinds: Kinds): KindNames =>
  (kind) => {
    const shown = kinds(kind);
    return shown?.names ? { name: shown.name, names: shown.names } : { name: shown?.name ?? kind };
  };

/** A drawn map as the kit copies it: its nodes in one layer, its roads as links. */
export function drawnMade(id: string, map: MapRecord, kinds: Kinds): MadeMap {
  return {
    map: id,
    seed: '',
    nodes: (map.nodes ?? []).map((node) => ({
      id: node.id,
      kind: node.kind,
      name: node.name ?? kinds(node.kind)?.name ?? node.kind,
      layer: 0,
      slot: 0,
    })),
    links: (map.roads ?? []).map((road) => [road.from, road.to] as const),
    start: map.start ?? '',
  };
}

/** A layered map made from a seed as the game makes it, or undefined when its rules can't make one. */
export function layeredMade(id: string, layers: LayerRules, kinds: Kinds, seed: string): MadeMap | undefined {
  try {
    return makeLayered(id, layers, namesOf(kinds), seed);
  } catch {
    // Rules the checks reject (E035) may not make a map at all; the problems above say why.
    return undefined;
  }
}

/** A made map as the map widget's view, every node known and nothing to travel by: the author sees it all. */
export function previewView(made: MadeMap, map: MapRecord, kinds: Kinds): MapView {
  const placed = new Map((map.nodes ?? []).map((node) => [node.id, node]));
  const oneWay = new Set((map.roads ?? []).filter((r) => r['one-way']).map((r) => `${r.from}>${r.to}`));
  return {
    map: made.map,
    name: map.name,
    shape: map.layers ? 'layered' : 'drawn',
    layers: made.nodes.reduce((most, node) => Math.max(most, node.layer + 1), 1),
    at: made.start,
    nodes: made.nodes.map((node): MapNode => {
      const place = placed.get(node.id);
      return {
        id: node.id,
        layer: node.layer,
        slot: node.slot,
        ...(place ? { x: place.x, y: place.y } : {}),
        known: true,
        visited: false,
        name: node.name,
        kind: kinds(node.kind)?.name ?? node.kind,
        description: kinds(node.kind)?.description ?? null,
        travels: [],
      };
    }),
    links: made.links.map(([from, to]) => ({
      from,
      to,
      oneWay: made.forward === true || oneWay.has(`${from}>${to}`),
    })),
  };
}

export interface RuleRow {
  /** What the rule asks, in words. */
  readonly rule: string;
  readonly kept: number;
  readonly of: number;
  /** The first seed that breaks it, and what it made. */
  readonly first?: { readonly seed: string; readonly found: string };
}

function ruleWords(check: RuleCheck, layers: LayerRules): string {
  if (check.rule === 'reach') return 'Every node is on a way from the start to the end';
  if (check.rule === 'crossing') return 'No two links cross';
  const rule = layers.place?.[Number(check.rule.slice(6))];
  if (!rule) return check.rule;
  const count = rule.min === rule.max ? `${rule.min}` : `${rule.min} to ${rule.max}`;
  const where =
    rule.from === undefined && rule.to === undefined
      ? ''
      : ` in layers ${rule.from ?? 1} to ${rule.to ?? layers.count - 2}`;
  return `${count} ${rule.kind}${where}${rule.apart ? ', none two in a layer' : ''}`;
}

/**
 * The check over seeds 1 to 300, rule by rule: what it asks, how many seeds keep it, the first that
 * doesn't. Undefined for rules that make no map, as a rule half typed may (at least 6, at most 0):
 * the form's value is the typed one before the index has checked it.
 */
export function ruleRows(id: string, layers: LayerRules, kinds: Kinds, seeds = SWEEP_SEEDS): RuleRow[] | undefined {
  try {
    return sweepLayered(id, layers, namesOf(kinds), seeds).map((check) => ({
      rule: ruleWords(check, layers),
      kept: check.kept,
      of: seeds,
      ...(check.first ? { first: check.first } : {}),
    }));
  } catch {
    return undefined;
  }
}

/** The next seed after the one typed: what Next seed moves on to, from 1 when the box holds no number. */
export function nextSeed(seed: string): string {
  const n = Number.parseInt(seed, 10);
  return Number.isFinite(n) && n >= 1 ? String(n + 1) : '1';
}
