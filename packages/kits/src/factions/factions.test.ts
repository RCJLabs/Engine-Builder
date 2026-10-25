import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { embassyGame, embassyWith, RECORDS } from '../../test/embassy.ts';

const { apply, attempt, fact, game, sim, start, step, wait } = embassyGame;
const standing = (state: GameState, faction: string) => fact(state, 'factions.standing', { faction });
const band = (state: GameState, faction: string) => fact(state, 'factions.band', { faction });
const slice = (state: GameState) => state.factions as { standing: Record<string, number> };
const change = (faction: string, by: number) => ({ effect: 'change-standing', faction, by });
const later = (state: GameState, days: number) => {
  const result = wait(state, days);
  expect(result.accepted).toBe(true);
  return result;
};

describe('a standing', () => {
  it('starts where its faction says, or at 0 kept within the bounds, and moves within them', () => {
    const state = start();
    expect([standing(state, 'traders'), standing(state, 'raiders'), standing(state, 'crown')]).toEqual([0, -10, 5]);
    const bounded = embassyWith({ faction: { up: { min: 3 }, down: { max: -2 } } });
    const first = bounded.start();
    expect([
      bounded.fact(first, 'factions.standing', { faction: 'up' }),
      bounded.fact(first, 'factions.standing', { faction: 'down' }),
    ]).toEqual([3, -2]);

    const up = attempt(state, change('traders', 15));
    expect(standing(up.state, 'traders')).toBe(10);
    expect(up.beats).toContainEqual({ type: 'factions/standing-changed', faction: 'traders', by: 10, to: 10 });
    expect(up.beats).toContainEqual({
      type: 'factions/band-changed',
      faction: 'traders',
      from: 'neutral',
      to: 'trusted',
    });
    expect(standing(apply(up.state, change('traders', -30)), 'traders')).toBe(-10);
    // Back at its start, the slice holds nothing for it.
    expect(slice(apply(up.state, change('traders', -10)))).toEqual({ standing: {} });
    // Nothing moves, so nothing is said: 0, or a push past a bound already reached.
    expect(attempt(state, change('traders', 0)).beats.some((b) => b.type.startsWith('factions/'))).toBe(false);
    expect(attempt(up.state, change('traders', 1)).beats.some((b) => b.type.startsWith('factions/'))).toBe(false);
    expect(() => apply(state, change('traders', 1.5))).toThrow('change-standing: "by" is a whole number');
  });

  it('holds nothing at a start its bounds set, and reads a saved standing within bounds content has moved', () => {
    const bounded = embassyWith({ faction: { up: { min: 3 } } });
    const moved = bounded.apply(bounded.start(), change('up', 4));
    expect(slice(moved)).toEqual({ standing: { up: 7 } });
    // Back at 3, where its bounds start it with no start of its own: the slice holds nothing for it.
    expect(slice(bounded.apply(moved, change('up', -4)))).toEqual({ standing: {} });
    // A content update that lowers its highest reaches the save: 7 reads as the new bound.
    const lowered = embassyWith({ faction: { up: { min: 3, max: 5 } } });
    expect(lowered.fact(moved, 'factions.standing', { faction: 'up' })).toBe(5);
  });

  it('says only a change within its band, when the band holds', () => {
    const moved = attempt(start(), change('raiders', 5));
    expect(moved.beats.filter((b) => b.type.startsWith('factions/'))).toEqual([
      { type: 'factions/standing-changed', faction: 'raiders', by: 5, to: -5 },
    ]);
  });

  it('falls in the last band it has reached, the first holding everything below', () => {
    const at = (n: number) => band(apply(start(), change('raiders', n + 10)), 'raiders');
    expect([at(-10), at(-11), at(-35), at(-36), at(24), at(25), at(60), at(100)]).toEqual([
      'wary',
      'cold',
      'cold',
      'hostile',
      'wary',
      'friendly',
      'sworn',
      'sworn',
    ]);
    const low = embassyWith({
      faction: {
        odd: {
          min: -10,
          bands: [
            { id: 'low', from: 0 },
            { id: 'high', from: 5 },
          ],
        },
      },
    });
    const below = low.apply(low.start(), change('odd', -5));
    expect(low.fact(below, 'factions.band', { faction: 'odd' })).toBe('low');
    // The crown has no bands: no band, and the whole price.
    expect(band(start(), 'crown')).toBeUndefined();
    expect(fact(start(), 'factions.price', { faction: 'crown' })).toBe(100);
  });

  it('has reached a band at or past where it begins, and every standing has reached the first', () => {
    const reached = (state: GameState, b: string) => fact(state, 'factions.reached', { faction: 'raiders', band: b });
    const state = start();
    expect(['hostile', 'cold', 'wary', 'friendly', 'sworn'].map((b) => reached(state, b))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(reached(apply(state, change('raiders', 35)), 'friendly')).toBe(true);
    expect(() => reached(state, 'frendly')).toThrow('Faction "raiders" has no band "frendly"');
  });

  it('previews where it would go, with its band before and after', () => {
    expect(game.preview(start(), [change('traders', 3), change('crown', -2), change('traders', 40)], sim)).toEqual([
      { effect: 'change-standing', faction: 'traders', from: 0, to: 3, band: { from: 'neutral', to: 'friendly' } },
      { effect: 'change-standing', faction: 'crown', from: 5, to: 3 },
      { effect: 'change-standing', faction: 'traders', from: 0, to: 10, band: { from: 'neutral', to: 'trusted' } },
    ]);
  });
});

describe('drift', () => {
  it('moves a point toward the resting value on its days, after the rows that day', () => {
    const seen = (state: GameState) => fact(state, 'flag.number', { flag: 'raiders-at-start' });
    const week = later(start(), 7).state;
    expect([standing(week, 'raiders'), seen(week)]).toEqual([-10, 7]);
    const eighth = later(week, 1);
    // The row on day 8 found the raiders still at −10: drift came after it.
    expect([standing(eighth.state, 'raiders'), seen(eighth.state)]).toEqual([-9, 8]);
    expect(eighth.beats).toContainEqual({ type: 'factions/standing-changed', faction: 'raiders', by: 1, to: -9 });
    expect(standing(later(eighth.state, 16).state, 'raiders')).toBe(-7);
  });

  it('comes down toward a resting value from above, and stops there', () => {
    const raised = apply(start(), change('raiders', 12));
    expect(standing(later(raised, 16).state, 'raiders')).toBe(0);
    const resting = apply(start(), change('raiders', 10));
    const after = later(resting, 24);
    expect(standing(after.state, 'raiders')).toBe(0);
    expect(after.beats.some((b) => b.type === 'factions/standing-changed')).toBe(false);
  });

  it('moves the factions that drift on a day in id order', () => {
    const pair = embassyWith({ faction: { zeta: { drift: { every: 1 } }, alpha: { drift: { every: 1 } } } });
    const day = pair.wait(pair.apply(pair.start(), change('zeta', 3), change('alpha', 3)), 1);
    const moved = day.beats.filter((b) => b.type === 'factions/standing-changed').map((b) => b.faction);
    expect(moved).toEqual(['alpha', 'zeta']);
  });

  it('rests at the start when it says no other value, kept within the bounds', () => {
    const records = {
      faction: {
        home: { start: 4, drift: { every: 2 } },
        edge: { min: -5, max: 5, drift: { every: 1, toward: 50 } },
      },
    };
    const drifting = embassyWith(records);
    const moved = drifting.apply(drifting.start(), change('home', -4), change('edge', -5));
    const two = drifting.wait(moved, 2).state;
    expect(drifting.fact(two, 'factions.standing', { faction: 'home' })).toBe(1);
    expect(drifting.fact(drifting.wait(two, 20).state, 'factions.standing', { faction: 'edge' })).toBe(5);
  });
});

describe('prices by band', () => {
  const shop = (state: GameState) => step(state, { type: 'embassy/visit', shop: 'post' });
  const price = (state: GameState, item: string, at = 'post') => fact(state, 'economy.price', { shop: at, item });
  const offer = (state: GameState, item: string) => fact(state, 'economy.offer', { shop: 'post', item });

  it('charge the band’s share of a shop that names the faction, rounded once to the step', () => {
    const at = (by: number) => shop(apply(start(), change('traders', by)));
    // Salt is 40 and wine 120: hostile 150%, cold 125%, neutral 100%, friendly 90%, trusted 75%.
    expect([-10, -5, 0, 2, 6].map((by) => [price(at(by), 'salt'), price(at(by), 'wine')])).toEqual([
      [60, 180],
      [50, 150],
      [40, 120],
      [35, 110],
      [30, 90],
    ]);
    // The market names no faction: the price stays.
    const market = step(apply(start(), change('traders', -10)), { type: 'embassy/visit', shop: 'market' });
    expect(price(market, 'salt', 'market')).toBe(40);
  });

  it('pay as before, and never more than they charge', () => {
    // The post pays 80%, down to the step: 95 for wine, until trusted charges 90 for it.
    expect(offer(shop(start()), 'wine')).toBe(95);
    expect(offer(shop(apply(start(), change('traders', 6))), 'wine')).toBe(90);
    expect(offer(shop(apply(start(), change('traders', -10))), 'wine')).toBe(95);
  });

  it('charge what the buy takes', () => {
    const trusted = shop(apply(start(), change('traders', 6)));
    const bought = game.reduce(trusted, { type: 'economy/buy', item: 'wine' }, sim);
    expect(bought.accepted).toBe(true);
    expect(bought.beats).toContainEqual({ type: 'economy/bought', shop: 'post', item: 'wine', price: 90 });
    expect(fact(bought.state, 'economy.amount', { resource: 'silver' })).toBe(RECORDS.resource.silver.start - 90);
  });
});

describe('an actor’s faction (M6.1, D73)', () => {
  const people = embassyWith({
    ...RECORDS,
    actor: { envoy: { name: 'Envoy', faction: 'traders' }, hermit: { name: 'Hermit' } },
  });
  const bandOf = (state: GameState, actor: string) => people.fact(state, 'factions.band-of', { actor });

  it('reads the party’s band with the faction an actor belongs to, as it moves', () => {
    const state = people.start();
    expect(bandOf(state, 'envoy')).toBe('neutral');
    expect(bandOf(people.apply(state, change('traders', 10)), 'envoy')).toBe('trusted');
  });

  it('reads as nothing for an actor with no faction, and throws for one content hasn’t', () => {
    expect(bandOf(people.start(), 'hermit')).toBeUndefined();
    expect(() => bandOf(people.start(), 'nobody')).toThrow('No actor "nobody"');
  });
});
