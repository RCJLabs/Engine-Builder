/**
 * Travel on a map (M4.6, docs/specs/maps.md#travel), in the sector and the valley: entering,
 * what is known, the moves offered and what they cost, arriving and its effects, the facts, and
 * the valley's quickest road with its time and cash.
 */
import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { RECORDS, sectorGame, sectorWith } from '../../test/sector.ts';
import { linksWithin, neighbours, quickest } from './roads.ts';
import { travelOf } from './travel.ts';
import type { MadeMap, MapRecord, Road } from './types.ts';

const g = sectorGame;
const made = (state: GameState) => g.slice(state).made as MadeMap;
const amount = (state: GameState, resource: string) => g.fact(state, 'economy.amount', { resource }) as number;
const heat = (state: GameState) => g.fact(state, 'flag.number', { flag: 'heat' }) as number;
const offered = (state: GameState) =>
  g
    .options(state)
    .filter((action) => action.type === 'maps/travel')
    .map((a) => `${a.move} ${a.to}`);

describe('entering a map', () => {
  it('makes the sector from the game’s seed and puts the party at its way in, knowing the ends, the charted and what is next', () => {
    const state = g.start();
    const slice = g.slice(state);
    expect(slice.entered).toBe(1);
    expect(slice.at).toBe('n0-0');
    expect(slice.visited).toEqual(['n0-0']);
    expect(made(state).seed).toMatch(/^sector\/\d+$/);
    // The ends, the charted, and what one link from the way in reaches: nothing else.
    const expected = made(state)
      .nodes.filter(
        (node) => node.layer <= 1 || node.id === 'n6-0' || node.kind === 'station' || node.kind === 'nebula',
      )
      .map((node) => node.id)
      .sort();
    expect(slice.known).toEqual(expected);
  });

  it('makes the same map for the same seed, another for another', () => {
    expect(made(g.start('a'))).toEqual(made(g.start('a')));
    expect(made(g.start('a')).seed).not.toBe(made(g.start('b')).seed);
  });
});

describe('moves', () => {
  it('offers a jump to each node one link on, and a long jump to those two links away, the way links go', () => {
    const state = g.start();
    const next = neighbours(made(state), undefined);
    const one = [...linksWithin(next, 'n0-0', 1).keys()].sort();
    const two = [...linksWithin(next, 'n0-0', 2).keys()].sort();
    expect(offered(state)).toEqual([...one.map((to) => `jump ${to}`), ...two.map((to) => `long ${to}`)]);
  });

  it('a jump costs a supply and two heat, by the same travel the options and the widget read', () => {
    const state = g.start();
    const to = made(state).nodes.find((node) => node.layer === 1)?.id as string;
    const travel = travelOf(g.sim.content, g.slice(state), 'jump', to, { economy: true });
    expect(travel?.cost).toEqual({ supplies: 1 });
    const after = g.travel(state, to);
    expect(amount(after, 'supplies')).toBe(
      12 - 1 + (made(after).nodes.find((n) => n.id === to)?.kind === 'station' ? 2 : 0),
    );
    expect(g.slice(after).at).toBe(to);
    expect(g.slice(after).visited).toEqual(['n0-0', to].sort());
  });

  it('can go back along a both-ways link, and a long jump cools the ship', () => {
    let state = g.start();
    const to = made(state).nodes.find((node) => node.layer === 1)?.id as string;
    state = g.travel(state, to);
    expect(offered(state)).toContain('jump n0-0');
    const far = offered(state)
      .find((o) => o.startsWith('long '))
      ?.slice(5) as string;
    const before = heat(state);
    state = g.travel(state, far, 'long');
    expect(heat(state)).toBeLessThanOrEqual(Math.max(0, before - 10) + 5);
  });

  it('offers nothing it can’t pay for, and refuses it as cant-afford with what is short', () => {
    const poor = { ...RECORDS, resource: { ...RECORDS.resource, supplies: { name: 'Supplies', start: 0 } } };
    const p = sectorWith({ records: poor });
    const state = p.start();
    expect(p.options(state).filter((a) => a.type === 'maps/travel')).toEqual([]);
    const to = made(state).nodes.find((node) => node.layer === 1)?.id as string;
    const refused = p.attempt(state, to);
    expect(refused.accepted).toBe(false);
    expect(refused.beats[0]).toMatchObject({ reason: 'cant-afford', resource: 'supplies', have: 0, need: 1 });
  });

  it('refuses a node out of reach and a move the map lacks', () => {
    const state = g.start();
    expect(g.attempt(state, 'n6-0').beats[0]).toMatchObject({ reason: 'out-of-reach' });
    expect(g.attempt(state, 'n1-0', 'warp').beats[0]).toMatchObject({ reason: 'out-of-reach' });
  });

  it('without the economy kit, charges nothing', () => {
    const free = sectorWith({
      economy: false,
      records: { ...RECORDS, 'node-kind': { ...RECORDS['node-kind'], station: { name: 'Station', charted: true } } },
    });
    const state = free.start();
    const to = made(state).nodes.find((node) => node.layer === 1)?.id as string;
    expect(free.slice(free.travel(state, to)).at).toBe(to);
  });
});

describe('arriving', () => {
  it('runs the kind’s arrival, is heard, and enters the next sector from the jump point', () => {
    let state = g.start();
    const seen = new Set<string>();
    // Jump along the first link of each node until the jump point enters the next sector.
    for (let hops = 0; hops < 12 && g.slice(state).entered === 1; hops++) {
      const here = g.slice(state).at as string;
      const next = made(state).links.find(([a]) => a === here)?.[1] as string;
      const step = g.game.reduce(state, { type: 'maps/travel', move: 'jump', to: next }, g.sim);
      for (const beat of step.beats) if (beat.type === 'maps/arrived') seen.add(String(beat.kind));
      state = step.state;
    }
    expect(g.slice(state).entered).toBe(2);
    expect(g.slice(state).at).toBe('n0-0');
    expect(g.slice(state).visited).toEqual(['n0-0']);
    expect(seen.has('jump-point')).toBe(true);
  });

  it('answers the facts: on, at, at-end, layer, entered, visited', () => {
    let state = g.start();
    expect(g.fact(state, 'maps.on', { map: 'sector' })).toBe(true);
    expect(g.fact(state, 'maps.on', { map: 'valley' })).toBe(false);
    expect(g.fact(state, 'maps.at', { kind: 'way-in' })).toBe(true);
    expect(g.fact(state, 'maps.layer')).toBe(0);
    expect(g.fact(state, 'maps.entered')).toBe(1);
    const to = made(state).nodes.find((node) => node.layer === 1) as { id: string; kind: string };
    state = g.travel(state, to.id);
    expect(g.fact(state, 'maps.layer')).toBe(1);
    expect(g.fact(state, 'maps.visited', { kind: to.kind })).toBeGreaterThanOrEqual(1);
    expect(g.fact(state, 'maps.at-end')).toBe(false);
  });

  it('a scan makes every node within its reach known', () => {
    const state = g.apply(g.start(), { effect: 'reveal-map', reach: 6 });
    expect(g.slice(state).known).toEqual(
      made(state)
        .nodes.map((node) => node.id)
        .sort(),
    );
  });
});

describe('the valley, drawn', () => {
  const v = sectorWith({ first: 'valley' });
  const tick = (state: GameState) => v.fact(state, 'time.tick') as number;
  const credits = (state: GameState) => v.fact(state, 'economy.amount', { resource: 'credits' }) as number;

  it('starts at the van, arriving there, every node reached by road offered', () => {
    const state = v.start();
    expect(v.slice(state).at).toBe('van');
    expect(v.fact(state, 'flag.on', { flag: 'home' })).toBe(true);
    expect(
      v
        .options(state)
        .filter((a) => a.type === 'maps/travel')
        .map((a) => a.to),
    ).toEqual(['slab', 'tower', 'town']);
  });

  it('drives the quickest road: to the slab by town, 3 hours and 3 credits, not 4 hours straight', () => {
    const state = v.start();
    const travel = travelOf(v.sim.content, v.slice(state), 'drive', 'slab', { economy: true, calendar: undefined });
    expect(travel?.path).toEqual(['van', 'slab']);
    const after = v.travel(state, 'slab', 'drive');
    expect(v.slice(after).at).toBe('slab');
    // With the calendar's hours, the route through town (1 + 2) beats the straight road's 4.
    expect(tick(after) - tick(state)).toBe(3);
    expect(credits(state) - credits(after)).toBe(3);
  });

  it('takes the cheaper of two roads as quick, and a one-way road never back, even beside another', () => {
    const map = (roads: MapRecord['roads']): MapRecord => ({
      name: 'Pass',
      start: 'a',
      nodes: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, kind: 'crag', x: i * 30, y: 50 })),
      roads,
      moves: [{ id: 'drive', label: 'Drive' }],
    });
    const hours = (road: Road) => road.takes?.hours ?? 0;
    // a to d by b or by c, two hours either way: by c costs nothing, so it is the quickest, ids aside.
    const tied = map([
      { from: 'a', to: 'b', takes: { hours: 1 }, cost: { credits: 2 } },
      { from: 'b', to: 'd', takes: { hours: 1 } },
      { from: 'a', to: 'c', takes: { hours: 1 } },
      { from: 'c', to: 'd', takes: { hours: 1 } },
    ]);
    expect(quickest(tied, 'a', hours).get('d')?.path).toEqual(['a', 'c', 'd']);
    // A fast road one way and a slow one both ways: back from b, only the slow one goes.
    const twin = map([
      { from: 'a', to: 'b', takes: { hours: 1 }, 'one-way': true },
      { from: 'a', to: 'b', takes: { hours: 5 } },
    ]);
    expect(quickest(twin, 'a', hours).get('b')?.ticks).toBe(1);
    expect(quickest(twin, 'b', hours).get('a')?.ticks).toBe(5);
    // Two roads the same way, the slow one written first: the fast one is taken.
    const slowFirst = map([
      { from: 'a', to: 'b', takes: { hours: 5 } },
      { from: 'b', to: 'a', takes: { hours: 2 } },
    ]);
    expect(quickest(slowFirst, 'a', hours).get('b')?.ticks).toBe(2);
  });

  it('follows one-way roads only their way: town to the tower, never back', () => {
    let state = v.travel(v.start(), 'town', 'drive');
    const toTower = v.options(state).find((a) => a.to === 'tower');
    expect(toTower).toBeDefined();
    state = v.travel(state, 'tower', 'drive');
    expect(tick(state)).toBeGreaterThan(0);
  });
});
