/**
 * The maps kit's checks (M4.6, D56, docs/specs/maps.md#checks): E035 for a map that doesn't hold
 * together; E053 for enter-map naming a node its map lacks; W119 and W120 for a cost or a time in
 * a game without the economy or the time kit; W135 for a layered map's rule some of 300 seeds
 * don't keep, with the first; W136 for a drawn map's node no road reaches.
 */
import type { Effect } from '@eb/core';
import {
  ECONOMY,
  type LayerRules,
  linksWithin,
  MAP,
  type MadeMap,
  type MapRecord,
  neighbours,
  SWEEP_SEEDS,
  sweepLayered,
  TIME,
} from '@eb/kits';
import type { Report } from './checkValue.ts';

const filled = (map: Readonly<Record<string, number>> | undefined) => Object.keys(map ?? {}).length > 0;

/** A rule's layers, checked against the map's: from 1 to the last before the end, from before to. */
function checkWindow(rule: { from?: number; to?: number }, last: number, path: string, report: Report): boolean {
  let sound = true;
  for (const key of ['from', 'to'] as const) {
    const layer = rule[key];
    if (layer !== undefined && layer > last) {
      report('E035', `${path}/${key}`, `Layer ${layer} is past the last before the end, ${last}`);
      sound = false;
    }
  }
  if (rule.from !== undefined && rule.to !== undefined && rule.from > rule.to) {
    report('E035', `${path}/to`, `It ends at layer ${rule.to}, before it starts at ${rule.from}`);
    sound = false;
  }
  return sound;
}

/** A layered map's rules: whether they can make a map at all. */
function checkLayers(layers: LayerRules, report: Report): boolean {
  let sound = true;
  const last = layers.count - 2;
  if (layers.widths.min > layers.widths.max) {
    report('E035', '/layers/widths/max', `At most ${layers.widths.max} is fewer than at least ${layers.widths.min}`);
    sound = false;
  }
  for (const [i, rule] of (layers.place ?? []).entries()) {
    const path = `/layers/place/${i}`;
    if (!checkWindow(rule, last, path, report)) {
      sound = false;
      continue;
    }
    if (rule.min > rule.max) {
      report('E035', `${path}/max`, `At most ${rule.max} is fewer than at least ${rule.min}`);
      sound = false;
    }
    const span = (rule.to ?? last) - (rule.from ?? 1) + 1;
    const room = rule.apart ? span : span * layers.widths.max;
    if (rule.min > room) {
      report(
        'E035',
        `${path}/min`,
        `${rule.min} can’t fit: its layers hold at most ${room}${rule.apart ? ', one to a layer' : ''}`,
      );
      sound = false;
    }
  }
  layers.mix.forEach((entry, i) => {
    if (!checkWindow(entry, last, `/layers/mix/${i}`, report)) sound = false;
  });
  for (let layer = 1; layer <= last && sound; layer++) {
    if (!layers.mix.some((entry) => layer >= (entry.from ?? 1) && layer <= (entry.to ?? last))) {
      report('E035', '/layers/mix', `No kind in the mix can be in layer ${layer}`);
      sound = false;
    }
  }
  return sound;
}

/** A drawn map's nodes, roads and start; the nodes no road reaches are W136. */
function checkDrawn(map: MapRecord, report: Report): void {
  const ids = new Set<string>();
  (map.nodes ?? []).forEach((node, i) => {
    if (ids.has(node.id)) report('E035', `/nodes/${i}/id`, `Two nodes are called ${node.id}`);
    ids.add(node.id);
  });
  (map.roads ?? []).forEach((road, i) => {
    for (const end of ['from', 'to'] as const)
      if (!ids.has(road[end])) report('E035', `/roads/${i}/${end}`, `The map has no node ${road[end]}`);
  });
  if (map.start === undefined || !ids.has(map.start)) {
    report(
      'E035',
      '/start',
      map.start === undefined ? 'A drawn map needs a start' : `The map has no node ${map.start}`,
    );
    return;
  }
  const made: MadeMap = {
    map: '',
    seed: '',
    nodes: (map.nodes ?? []).map((node) => ({ id: node.id, kind: node.kind, name: '', layer: 0, slot: 0 })),
    links: (map.roads ?? [])
      .filter((road) => ids.has(road.from) && ids.has(road.to))
      .map((road) => [road.from, road.to] as const),
    start: map.start,
  };
  const reached = linksWithin(neighbours(made, map), map.start, ids.size);
  (map.nodes ?? []).forEach((node, i) => {
    if (node.id !== map.start && !reached.has(node.id))
      report('W136', `/nodes/${i}`, `No road reaches ${node.id} from ${map.start}`);
  });
}

function checkMoves(map: MapRecord, drawn: boolean, on: readonly string[], report: Report): void {
  const ids = new Set<string>();
  map.moves.forEach((move, i) => {
    const path = `/moves/${i}`;
    if (ids.has(move.id)) report('E035', `${path}/id`, `Two moves are called ${move.id}`);
    ids.add(move.id);
    if (move.reach !== undefined && drawn && !map.layers)
      report('E035', `${path}/reach`, 'A drawn map’s moves follow roads: Reach is for a layered map');
  });
  const costs = [
    ...map.moves.map((move, i) => [`/moves/${i}`, move] as const),
    ...(map.roads ?? []).map((road, i) => [`/roads/${i}`, road] as const),
  ];
  for (const [path, part] of costs) {
    if (!on.includes(ECONOMY) && filled(part.cost))
      report('W119', `${path}/cost`, 'It costs, in a game without the economy kit: nothing charges it');
    if (!on.includes(TIME) && filled(part.takes))
      report('W120', `${path}/takes`, 'It takes time, in a game without the time kit: no time passes');
  }
}

/** Each rule a layered map's seeds don't all keep, with the first that doesn't. */
function checkSeeds(id: string, layers: LayerRules, report: Report): void {
  for (const check of sweepLayered(id, layers, (kind) => ({ name: kind }))) {
    if (!check.first) continue;
    const path = check.rule.startsWith('place ') ? `/layers/place/${check.rule.slice(6)}` : '/layers';
    report(
      'W135',
      path,
      `Kept in ${check.kept} of ${SWEEP_SEEDS} seeds: seed ${check.first.seed} makes ${check.first.found}`,
    );
  }
}

interface Entered {
  readonly report: Report;
  readonly path: string;
  readonly map: string;
  readonly at: string;
}

export class MapChecks {
  private readonly on: readonly string[];
  private readonly maps = new Map<string, MapRecord>();
  private readonly entered: Entered[] = [];

  constructor(on: readonly string[]) {
    this.on = on;
  }

  /** One record that passed its schema. */
  record(type: string, id: string, value: unknown, report: Report): void {
    if (type !== MAP) return;
    const map = value as MapRecord;
    this.maps.set(id, map);
    const drawn = map.nodes !== undefined || map.roads !== undefined;
    if (map.layers && drawn) report('E035', '', 'It is both layered and drawn: give Layers, or Nodes and Roads');
    else if (!map.layers && !drawn)
      report('E035', '', 'It is neither layered nor drawn: give Layers, or Nodes and Roads');
    else if (map.layers) {
      if (checkLayers(map.layers, report)) checkSeeds(id, map.layers, report);
    } else checkDrawn(map, report);
    checkMoves(map, drawn, this.on, report);
  }

  /** An effect whose schema passed: enter-map's node, checked once every map is read. */
  effect(report: Report, path: string, effect: Effect): void {
    if (effect.effect !== 'enter-map' || typeof effect.at !== 'string' || typeof effect.map !== 'string') return;
    this.entered.push({ report, path: `${path}/at`, map: effect.map, at: effect.at });
  }

  finish(): void {
    for (const { report, path, map, at } of this.entered) {
      const record = this.maps.get(map);
      if (!record) continue;
      if (record.layers) report('E053', path, `${map} is layered, made anew each time: it has no node to name`);
      else if (!(record.nodes ?? []).some((node) => node.id === at)) report('E053', path, `${map} has no node ${at}`);
    }
  }
}
