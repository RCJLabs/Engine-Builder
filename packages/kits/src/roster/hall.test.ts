/**
 * Halls (docs/specs/roster.md#actions): hiring an offer in the mode `hiring`, its fee paid by the
 * economy kit's pay-cost, the slots offered being exactly the slots a hire accepts.
 */
import type { Action, GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { mustered, musterWith, RECORDS, withRoster } from '../../test/muster.ts';
import { hallIn } from './hall.ts';
import { offerAt } from './offers.ts';
import type { RosterSlice } from './types.ts';

const { game, sim, start, apply, attempt, visit, hire, fact, content } = mustered;
const slice = (state: GameState) => state.roster as RosterSlice;
const offered = (state: GameState) => game.options(state, sim).map((a) => ({ ...a }));
const credits = (state: GameState) => fact(state, 'economy.amount', { resource: 'credits' });

describe('a hall', () => {
  it('opens in the mode hiring and is left by its action', () => {
    const step = game.reduce(start(), { type: 'muster/visit', hall: 'dock' }, sim);
    expect(step.beats).toContainEqual({ type: 'roster/hall-opened', hall: 'dock' });
    expect(step.state.kernel.modes.at(-1)).toEqual({ id: 'hiring', data: { hall: 'dock' } });
    const left = game.reduce(step.state, { type: 'roster/leave-hall' }, sim);
    expect(left.beats).toContainEqual({ type: 'roster/hall-left', hall: 'dock' });
    expect(left.state.kernel.modes.map((m) => m.id)).toEqual(['muster']);
    expect(hallIn({ id: 'muster' })).toBeUndefined();
    expect(hallIn({ id: 'shopping', data: { hall: 'dock' } })).toBeUndefined();
  });

  it('is refused while another is open, and a hall that doesn’t exist throws', () => {
    const twice = attempt(start(), { effect: 'open-hall', hall: 'dock' }, { effect: 'open-hall', hall: 'camp' });
    expect(twice.accepted).toBe(false);
    expect(twice.beats[0]).toMatchObject({ reason: 'already-in-hall', hall: 'dock' });
    expect(() => apply(start(), { effect: 'open-hall', hall: 'tavern' })).toThrow('No hall "tavern"');
  });

  it('offers each slot not hired, while there is room and the fee can be paid', () => {
    let state = visit(start(), 'dock');
    expect(offered(state)).toEqual([
      { type: 'roster/hire', slot: 0 },
      { type: 'roster/hire', slot: 1 },
      { type: 'roster/leave-hall' },
    ]);
    state = (hire(state, 1) as { state: GameState }).state;
    expect(offered(state)).toEqual([{ type: 'roster/hire', slot: 0 }, { type: 'roster/leave-hall' }]);
    const camp = visit(start(), 'camp');
    expect(offered(camp)).toEqual([{ type: 'roster/hire', slot: 0 }, { type: 'roster/leave-hall' }]);
  });
});

describe('a hall’s offers as facts', () => {
  it('say who stands in each slot, rolled from what, with which traits and for what fee', () => {
    const state = visit(start(), 'dock');
    for (const slot of [0, 1]) {
      const offer = offerAt(content(state), slice(state), 'dock', slot);
      expect(fact(state, 'roster.offer', { hall: 'dock', slot })).toBe(offer.name);
      expect(fact(state, 'roster.offer-recruit', { hall: 'dock', slot })).toBe(offer.recruit);
      expect(fact(state, 'roster.offer-fee', { hall: 'dock', slot, resource: 'credits' })).toBe(offer.fee.credits ?? 0);
      // A resource the fee doesn't name costs nothing, whatever the fee in credits.
      expect(offer.fee.credits).toBeGreaterThan(0);
      expect(fact(state, 'roster.offer-fee', { hall: 'dock', slot, resource: 'rations' })).toBe(0);
      const names = (offer.traits ?? []).map(
        (trait) => (RECORDS.status as Record<string, { name?: string }>)[trait]?.name ?? trait,
      );
      expect(fact(state, 'roster.offer-traits', { hall: 'dock', slot })).toBe(
        names.length > 0 ? names.join(', ') : undefined,
      );
    }
  });

  it('have no value for a slot the hall doesn’t have, or one hired this round', () => {
    const state = visit(start(), 'dock');
    expect(fact(state, 'roster.offer', { hall: 'dock', slot: 2 })).toBeUndefined();
    const hired = (hire(state, 1) as { state: GameState }).state;
    expect(fact(hired, 'roster.offer', { hall: 'dock', slot: 1 })).toBeUndefined();
    expect(fact(hired, 'roster.offer-fee', { hall: 'dock', slot: 1, resource: 'credits' })).toBeUndefined();
    expect(fact(hired, 'roster.offer', { hall: 'dock', slot: 0 })).toBe(
      fact(state, 'roster.offer', { hall: 'dock', slot: 0 }),
    );
  });
});

describe('hiring', () => {
  it('pays the fee, makes the offer a member and marks its slot hired for the round', () => {
    const before = visit(start(), 'dock');
    const offer = offerAt(content(before), slice(before), 'dock', 0);
    const step = hire(before, 0);
    expect(step.accepted).toBe(true);
    const id = `${offer.recruit}-0`;
    expect(slice(step.state).members).toEqual(['ana', 'bo', id]);
    expect(slice(step.state).made[id]).toEqual({
      recruit: offer.recruit,
      name: offer.name,
      ...(offer.stats ? { stats: offer.stats } : {}),
      ...(offer.traits ? { traits: offer.traits } : {}),
    });
    expect(slice(step.state).halls).toEqual({ dock: { round: 0, hired: [0] } });
    expect(credits(step.state)).toBe(100 - (offer.fee.credits ?? 0));
    const types = step.beats.map((b) => b.type).filter((t) => t !== 'stats/status-added');
    expect(types).toEqual(['economy/changed', 'roster/joined', 'roster/hired']);
    expect(step.beats.at(-1)).toEqual({ type: 'roster/hired', hall: 'dock', slot: 0, actor: id });
  });

  it('is refused when the fee can’t be paid, and the slot isn’t offered', () => {
    const poor = apply(start(), { effect: 'add-resource', resource: 'credits', by: -90 });
    const state = visit(poor, 'dock');
    expect(offered(state)).toEqual([{ type: 'roster/leave-hall' }]);
    const offer = offerAt(content(state), slice(state), 'dock', 0);
    expect(hire(state, 0).beats[0]).toMatchObject({
      reason: 'cant-afford',
      hall: 'dock',
      slot: 0,
      resource: 'credits',
      have: 10,
      need: offer.fee.credits,
    });
  });

  it('is refused for a slot hired, a slot the hall hasn’t got, and past the cap', () => {
    const state = (hire(visit(start(), 'dock'), 0) as { state: GameState }).state;
    expect(hire(state, 0).beats[0]).toMatchObject({ reason: 'hired', slot: 0 });
    for (const slot of [2, -1, 0.5, 'one']) {
      expect(game.reduce(state, { type: 'roster/hire', slot } as Action, sim).beats[0]).toMatchObject({
        reason: 'no-such-slot',
      });
    }
    const crowded = musterWith(withRoster({ cap: 2 }));
    const full = crowded.visit(crowded.start(), 'dock');
    expect(crowded.game.options(full, crowded.sim)).toEqual([{ type: 'roster/leave-hall' }]);
    expect(crowded.hire(full, 0).beats[0]).toMatchObject({ reason: 'roster-full' });
    expect(hire(start(), 0).beats[0]).toMatchObject({ reason: 'mode' });
  });

  it('starts over in the next round, none of its slots hired', () => {
    let state = (hire(visit(start(), 'dock'), 0) as { state: GameState }).state;
    const round0 = offerAt(content(state), slice(state), 'dock', 1);
    state = game.reduce(state, { type: 'roster/leave-hall' }, sim).state;
    state = apply(state, { effect: 'refresh-hall', hall: 'dock' });
    expect(slice(state).halls).toEqual({ dock: { round: 1 } });
    state = visit(state, 'dock');
    expect(offered(state).filter((a) => a.type === 'roster/hire')).toHaveLength(2);
    expect(offerAt(content(state), slice(state), 'dock', 1)).not.toEqual(round0);
  });

  it('offers a hire the fee takes below 0 when the resource goes that low, as pay-cost does', () => {
    const debt = musterWith({ ...RECORDS, resource: { credits: { name: 'Credits', start: 10, min: -100 } } });
    const state = debt.visit(debt.start(), 'dock');
    expect(debt.game.options(state, debt.sim).filter((a) => a.type === 'roster/hire')).toHaveLength(2);
    expect(debt.hire(state, 0).accepted).toBe(true);
  });

  it('takes anyone with no cap at all', () => {
    const open = musterWith(withRoster({ cap: undefined }));
    let state = open.visit(open.start(), 'dock');
    state = (open.hire(state, 0) as { state: GameState }).state;
    expect(open.hire(state, 1).accepted).toBe(true);
  });

  it('charges nothing without the economy kit', () => {
    const free = musterWith(RECORDS, false);
    const state = free.visit(free.start(), 'dock');
    const step = free.hire(state, 0);
    expect(step.accepted).toBe(true);
    expect(step.beats.some((b) => b.type.startsWith('economy/'))).toBe(false);
  });

  it('accepts every hire it offers, and makes the offer worked out again from its hall, round and slot', () => {
    let hired = 0;
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      let state = start(seed);
      for (let round = 0; round < 3; round++) {
        state = visit(apply(state, { effect: 'add-resource', resource: 'credits', by: 150 }), 'dock');
        for (;;) {
          const hires = offered(state).filter((a) => a.type === 'roster/hire');
          const option = hires[0];
          if (option === undefined) break;
          const offer = offerAt(content(state), slice(state), 'dock', option.slot as number);
          const step = game.reduce(state, option as Action, sim);
          expect(step.accepted).toBe(true);
          const id = step.beats.find((b) => b.type === 'roster/hired')?.actor as string;
          hired++;
          expect((content(step.state).get('actor', id) as { name: string }).name).toBe(offer.name);
          state = apply(game.reduce(step.state, { type: 'roster/leave-hall' }, sim).state, {
            effect: 'leave',
            actor: id,
            why: 'dismissed',
          });
          state = visit(state, 'dock');
        }
        state = apply(game.reduce(state, { type: 'roster/leave-hall' }, sim).state, {
          effect: 'refresh-hall',
          hall: 'dock',
        });
      }
    }
    // Both slots of all three rounds, in every seed.
    expect(hired).toBe(36);
  });
});
