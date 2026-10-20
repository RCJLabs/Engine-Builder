/**
 * The check over seeds (M4.6, docs/specs/maps.md#checks): the sector's rules kept in every one of
 * 300 seeds; a rule some seeds break, counted, with the first such seed and what it made, which
 * that seed's map shows again; and a map whose links were made to cross or to strand a node.
 */
import { describe, expect, it } from 'vitest';
import { SECTOR_RULES } from '../../test/sector.ts';
import { makeLayered } from './layered.ts';
import { crossingBroken, placeBroken, reachBroken, SWEEP_SEEDS, sweepLayered } from './sweep.ts';
import type { KindNames, LayerRules, MadeMap } from './types.ts';

const NAMES: KindNames = (kind) => ({ name: kind });
const RULES = SECTOR_RULES as unknown as LayerRules;

describe('sweepLayered', () => {
  it('finds the sector keeping every rule in all 300 seeds', () => {
    expect(sweepLayered('sector', RULES, NAMES)).toEqual([
      { rule: 'place 0', kept: SWEEP_SEEDS },
      { rule: 'place 1', kept: SWEEP_SEEDS },
      { rule: 'reach', kept: SWEEP_SEEDS },
      { rule: 'crossing', kept: SWEEP_SEEDS },
    ]);
  });

  it('counts the seeds a rule can’t always be kept in, and names the first, whose map shows it again', () => {
    // Four stations apart in five layers of one or two: a layer of one can't always hold one beside the nebula.
    const rules: LayerRules = {
      ...RULES,
      widths: { min: 1, max: 2 },
      place: [
        { kind: 'nebula', min: 2, max: 2, apart: true },
        { kind: 'station', min: 4, max: 4, apart: true },
      ],
    };
    const [, stations] = sweepLayered('sector', rules, NAMES);
    expect(stations?.rule).toBe('place 1');
    expect(stations?.kept).toBeGreaterThan(0);
    expect(stations?.kept).toBeLessThan(SWEEP_SEEDS);
    const first = stations?.first as { seed: string; found: string };
    expect(first.found).toMatch(/^[0-3] station$/);
    const again = makeLayered('sector', rules, NAMES, first.seed);
    expect(placeBroken(again, (rules.place ?? [])[1] as never, 5)).toBe(first.found);
  });

  it('finds crossing links and stranded nodes in a map that has them', () => {
    const base = makeLayered('sector', { ...RULES, extra: 0 }, NAMES, '1');
    const twoAfter = base.nodes.filter((node) => node.layer === 1).map((node) => node.id);
    const [a, b] = [twoAfter[0] as string, twoAfter.at(-1) as string];
    const next = base.nodes.filter((node) => node.layer === 2).map((node) => node.id);
    const crossed: MadeMap = { ...base, links: [...base.links, [a, next.at(-1) as string], [b, next[0] as string]] };
    expect(crossingBroken(crossed)).toMatch(/crosses/);
    // Links go both ways here, so a node is stranded only with none at all.
    const stranded: MadeMap = { ...base, links: base.links.filter(([from, to]) => from !== a && to !== a) };
    expect(reachBroken(stranded)).toBe(`${a} unreached`);
    // A node of the layer before the end leads only to the end: cut that, and going forward it is stuck.
    const last = base.nodes.find((node) => node.layer === 5)?.id as string;
    const stuck: MadeMap = { ...base, forward: true, links: base.links.filter(([from]) => from !== last) };
    // The first node in order that can't go on is named: it may be one that led only through `last`.
    expect(reachBroken(stuck)).toMatch(/^n\d-\d can’t reach the end$/);
    expect(reachBroken(base)).toBeUndefined();
  });

  it('finds two of a kind kept apart in one layer, which the generator never makes', () => {
    const base = makeLayered('sector', { ...RULES, extra: 0 }, NAMES, '1');
    const rule = { kind: 'station', min: 2, max: 2, apart: true };
    const pair = base.nodes.filter((node) => node.layer === 1).slice(0, 2);
    const together: MadeMap = {
      ...base,
      nodes: base.nodes.map((node) =>
        pair.includes(node)
          ? { ...node, kind: 'station' }
          : node.kind === 'station'
            ? { ...node, kind: 'empty' }
            : node,
      ),
    };
    expect(placeBroken(together, rule, 5)).toBe('two station in layer 1');
    expect(placeBroken(together, { ...rule, apart: false }, 5)).toBeUndefined();
  });
});
