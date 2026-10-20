/**
 * The layered map generator (M4.6, docs/specs/maps.md#the-generator), held as space-wrecked's
 * tests hold its sectors (`tests/sector.test.js`): over every width and many seeds, links only
 * between neighbouring layers, never crossing or repeated, a way on and a way back from every
 * node, the placed kinds kept, the mix within its weights, names unique, and the same seed always
 * making the same map.
 */
import { canonicalJson } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { SECTOR_RULES } from '../../test/sector.ts';
import { along, crosses, makeLayered } from './layered.ts';
import { crossingBroken, placeBroken, reachBroken } from './sweep.ts';
import type { KindNames, LayerRules, MadeMap } from './types.ts';

const NAMES: KindNames = (kind) =>
  kind === 'station' ? { name: 'Station', names: ['Mac’s Pumps', 'Halfway House', 'Rest Stop Nine'] } : { name: kind };
const RULES = SECTOR_RULES as unknown as LayerRules;
const make = (seed: string, rules: LayerRules = RULES) => makeLayered('sector', rules, NAMES, seed);
const plain = (count: number, min: number, max: number, extra = 50): LayerRules => ({
  count,
  widths: { min, max },
  start: 'start',
  end: 'end',
  links: 'both',
  extra,
  mix: [{ kind: 'empty', weight: 1 }],
});
const layerOf = (made: MadeMap, id: string) => made.nodes.find((node) => node.id === id)?.layer as number;

describe('along', () => {
  it('maps a slot to the same relative height, never going back as the slot goes on', () => {
    expect([0, 1, 2].map((i) => along(i, 3, 2))).toEqual([0, 1, 1]);
    expect([0, 1].map((i) => along(i, 2, 3))).toEqual([0, 2]);
    expect(along(0, 1, 3)).toBe(1);
    expect(along(0, 1, 4)).toBe(1);
    for (let n = 1; n <= 4; n++)
      for (let m = 1; m <= 4; m++)
        for (let i = 1; i < n; i++) expect(along(i, n, m)).toBeGreaterThanOrEqual(along(i - 1, n, m));
  });

  it('calls links crossing only when their ends are in opposite orders', () => {
    expect(crosses([0, 1], [1, 0])).toBe(true);
    expect(crosses([0, 0], [1, 1])).toBe(false);
    expect(crosses([0, 1], [0, 0])).toBe(false);
    expect(crosses([1, 1], [0, 1])).toBe(false);
  });
});

describe('makeLayered', () => {
  it('over every width and 50 seeds each, links only to the next layer, never crossing or twice, a way on and back from every node', () => {
    for (let min = 1; min <= 4; min++)
      for (let max = min; max <= 4; max++)
        for (const count of [3, 5, 12])
          for (let seed = 1; seed <= 50; seed++) {
            const made = make(`w${min}${max}${count}/${seed}`, plain(count, min, max));
            const middle = made.nodes.filter((node) => node.layer > 0 && node.layer < count - 1);
            expect(middle.every((node) => made.nodes.filter((n) => n.layer === node.layer).length <= max)).toBe(true);
            expect(made.nodes.filter((node) => node.layer === 0)).toHaveLength(1);
            expect(made.nodes.filter((node) => node.layer === count - 1)).toHaveLength(1);
            for (const [a, b] of made.links) expect(layerOf(made, b) - layerOf(made, a)).toBe(1);
            expect(new Set(made.links.map((link) => link.join())).size).toBe(made.links.length);
            expect(crossingBroken(made)).toBeUndefined();
            expect(reachBroken(made)).toBeUndefined();
            for (const node of made.nodes) {
              if (node.layer > 0) expect(made.links.some(([, b]) => b === node.id)).toBe(true);
              if (node.layer < count - 1) expect(made.links.some(([a]) => a === node.id)).toBe(true);
            }
          }
  });

  it('starts and ends on their kinds, with ids by layer and slot', () => {
    const made = make('ids');
    expect(made.start).toBe('n0-0');
    expect(made.end).toBe('n6-0');
    expect(made.nodes[0]).toMatchObject({ id: 'n0-0', kind: 'way-in', layer: 0, slot: 0 });
    expect(made.nodes.at(-1)).toMatchObject({ id: 'n6-0', kind: 'jump-point', layer: 6, slot: 0 });
    expect(made.forward).toBeUndefined();
    expect(make('ids', { ...RULES, links: 'forward' }).forward).toBe(true);
  });

  it('makes the same map from the same seed, and others from others', () => {
    expect(canonicalJson(make('same'))).toBe(canonicalJson(make('same')));
    const many = new Set(Array.from({ length: 200 }, (_, i) => canonicalJson({ ...make(`s${i}`), seed: '' })));
    expect(many.size).toBeGreaterThan(190);
  });

  it('keeps the sector’s rules in 300 seeds: two stations and a nebula, each in a layer of its own', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const made = make(String(seed));
      for (const rule of RULES.place ?? []) expect(placeBroken(made, rule, 5)).toBeUndefined();
      const stations = made.nodes.filter((node) => node.kind === 'station');
      expect(new Set(stations.map((node) => node.layer)).size).toBe(2);
    }
  });

  it('rolls the rest by the mix’s weights, within 0.8 to 1.25 of them over 300 seeds', () => {
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 300; seed++)
      for (const node of make(String(seed)).nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
    const mixed = RULES.mix.map((entry) => counts.get(entry.kind) ?? 0);
    const total = mixed.reduce((a, b) => a + b, 0);
    for (const [i, entry] of RULES.mix.entries()) {
      const share = (mixed[i] as number) / total / (entry.weight / 6);
      expect(share).toBeGreaterThan(0.8);
      expect(share).toBeLessThan(1.25);
    }
  });

  it('rolls a kind only inside its layers', () => {
    const rules: LayerRules = {
      ...plain(7, 2, 3),
      mix: [
        { kind: 'early', weight: 1, to: 2 },
        { kind: 'late', weight: 1, from: 3 },
      ],
    };
    for (let seed = 1; seed <= 50; seed++)
      for (const node of make(String(seed), rules).nodes) {
        if (node.kind === 'early') expect(node.layer).toBeLessThanOrEqual(2);
        if (node.kind === 'late') expect(node.layer).toBeGreaterThanOrEqual(3);
      }
  });

  it('never makes an avoidable kind the only way on, and places fewer when no slot fits', () => {
    const rules: LayerRules = {
      ...plain(9, 1, 3, 0),
      place: [{ kind: 'elite', min: 2, max: 2, from: 4, to: 7, apart: true, avoidable: true }],
    };
    let short = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const made = make(String(seed), rules);
      const broken = placeBroken(made, (rules.place ?? [])[0] as never, 7);
      if (broken?.endsWith('elite')) short++;
      else expect(broken).toBeUndefined();
    }
    // Widths of 1 leave no avoidable slot in some layers: those seeds place fewer, and the check over seeds says so.
    expect(short).toBeGreaterThan(0);
  });

  it('names nodes from their kind’s names, none twice, then by the kind, numbered from 2', () => {
    const rules: LayerRules = { ...plain(12, 4, 4, 0), mix: [{ kind: 'station', weight: 1 }] };
    const names = make('names', rules)
      .nodes.filter((node) => node.kind === 'station')
      .map((node) => node.name);
    expect(new Set(names.slice(0, 3))).toEqual(new Set(['Mac’s Pumps', 'Halfway House', 'Rest Stop Nine']));
    expect(names.slice(3, 6)).toEqual(['Station', 'Station 2', 'Station 3']);
  });
});
