/**
 * Consequences (docs/specs/events.md#consequences): booked to land after days, choices or a
 * number flag's rise, checked again as they come due, cancelled or replaced by id, and landing
 * with the receipt of the choice that booked them.
 */
import type { Effect, GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { caravanGame } from '../../test/caravan.ts';
import type { EventsSlice } from './types.ts';

const { game, sim, start, apply, attempt, choose, fact } = caravanGame;
const slice = (state: GameState) => state.events as EventsSlice;
const scrap = (state: GameState) => fact(state, 'economy.amount', { resource: 'scrap' });
const gain: Effect = { effect: 'add-resource', resource: 'scrap', by: 5 };
const later = (after: object, extra: object = {}): Effect => ({ effect: 'later', after, do: [gain], ...extra });
const doing = (state: GameState, ...effects: Effect[]) => game.reduce(state, { type: 'caravan/do', effects }, sim);
const types = (beats: readonly { type: string }[]) => beats.map((b) => b.type).filter((t) => t.startsWith('events/'));

describe('a consequence', () => {
  it('counting days lands as the day it is due starts', () => {
    const booked = doing(start(), later({ days: 2 }, { id: 'pay-day' }));
    expect(booked.beats).toContainEqual({ type: 'events/booked', later: 'pay-day' });
    let state = booked.state;
    expect(slice(state).laters).toEqual([{ id: 'pay-day', seq: 0, due: { day: 2 }, do: [gain] }]);
    expect(fact(state, 'events.left', { later: 'pay-day' })).toBe(2);
    state = apply(state, { effect: 'wait', days: 1 });
    expect([
      fact(state, 'events.pending', { later: 'pay-day' }),
      fact(state, 'events.left', { later: 'pay-day' }),
    ]).toEqual([true, 1]);
    const landed = doing(state, { effect: 'wait', days: 1 });
    expect(landed.beats).toContainEqual({ type: 'events/landed', later: 'pay-day', event: '', choice: '' });
    expect(scrap(landed.state)).toBe(45);
    expect([fact(landed.state, 'events.booked'), fact(landed.state, 'events.left', { later: 'pay-day' })]).toEqual([
      0,
      undefined,
    ]);
  });

  it('counting choices lands after the choice that brings it due, before the next event opens', () => {
    let state = apply(start(), later({ choices: 2 }, { id: 'echo' }));
    state = apply(state, { effect: 'open-event', event: 'quiet' });
    state = (choose(state, 'go-on') as { state: GameState }).state;
    expect(fact(state, 'events.left', { later: 'echo' })).toBe(1);
    state = apply(state, { effect: 'open-event', event: 'quiet' }, { effect: 'open-event', event: 'trader' });
    const step = choose(state, 'go-on');
    expect(types(step.beats)).toEqual(['events/chosen', 'events/landed', 'events/opened']);
    expect(scrap(step.state)).toBe(45);
  });

  it('counting a number flag lands once the flag has risen by enough', () => {
    let state = apply(start(), later({ flag: 'nodes', by: 2 }));
    expect(slice(state).laters[0]).toMatchObject({ id: '#0', due: { flag: 'nodes', at: 2 } });
    state = apply(state, { effect: 'add-to-flag', flag: 'nodes', by: 1 });
    expect(fact(state, 'events.left', { later: '#0' })).toBe(1);
    const step = doing(state, { effect: 'add-to-flag', flag: 'nodes', by: 1 });
    expect(step.beats).toContainEqual({ type: 'events/landed', later: '#0', event: '', choice: '' });
    // `by` is 1 when left out.
    expect(slice(apply(start(), later({ flag: 'nodes' }))).laters[0]?.due).toEqual({ flag: 'nodes', at: 1 });
  });

  it('is dropped when its If no longer holds as it comes due', () => {
    const state = apply(
      start(),
      later({ days: 1 }, { id: 'favour', if: { fact: 'flag.on', args: { flag: 'helped' } } }),
    );
    const step = doing(state, { effect: 'wait', days: 1 });
    expect(step.beats).toContainEqual({ type: 'events/dropped', later: 'favour' });
    expect(scrap(step.state)).toBe(40);
    expect(slice(step.state).laters).toEqual([]);
  });

  it('is cancelled or replaced by its id', () => {
    let state = apply(start(), later({ days: 1 }, { id: 'debt' }), later({ days: 3 }, { id: 'debt' }));
    expect(slice(state).laters.map((l) => [l.id, l.seq, l.due])).toEqual([['debt', 1, { day: 3 }]]);
    const cancelled = doing(state, { effect: 'cancel-later', id: 'debt' });
    expect(cancelled.beats).toContainEqual({ type: 'events/cancelled', later: 'debt' });
    state = cancelled.state;
    expect(fact(state, 'events.pending', { later: 'debt' })).toBe(false);
    expect(types(doing(state, { effect: 'cancel-later', id: 'debt' }).beats)).toEqual([]);
    expect(() => apply(state, { effect: 'cancel-later', id: '#1' })).toThrow('is not lowercase words');
  });

  it('keeps the event and choice that booked it, and lands with them', () => {
    let state = apply(start(), { effect: 'open-event', event: 'loan-shark' });
    state = (choose(state, 'borrow') as { state: GameState }).state;
    expect(slice(state).laters[0]).toMatchObject({ id: 'debt', from: { event: 'loan-shark', choice: 'borrow' } });
    expect(slice(state)).not.toHaveProperty('choosing');
    state = apply(state, { effect: 'add-to-flag', flag: 'nodes', by: 2 });
    const step = doing(state, { effect: 'add-to-flag', flag: 'nodes', by: 1 });
    expect(step.beats).toContainEqual({ type: 'events/landed', later: 'debt', event: 'loan-shark', choice: 'borrow' });
    expect(fact(step.state, 'events.open')).toBe('debt-due');
  });

  it('that refuses as it lands is undone and dropped, saying why', () => {
    const state = apply(start(), {
      ...later({ days: 1 }, { id: 'patch' }),
      do: [gain, { effect: 'take-item', item: 'medkit' }],
    });
    const step = doing(state, { effect: 'wait', days: 1 });
    expect(step.accepted).toBe(true);
    expect(step.beats).toContainEqual({ type: 'events/refused', later: 'patch', reason: 'not-enough' });
    expect(step.beats).not.toContainEqual(expect.objectContaining({ type: 'events/landed' }));
    expect(scrap(step.state)).toBe(40);
    expect(slice(step.state).laters).toEqual([]);
  });

  it('previews when it would come due', () => {
    const shown = game.preview(
      start(),
      [later({ days: 4 }), later({ choices: 1 }), later({ flag: 'nodes', by: 3 })],
      sim,
    );
    expect(shown.map((p) => p.due)).toEqual([{ day: 4 }, { choices: 1 }, { flag: 'nodes', at: 3 }]);
  });

  it('throws on what validation stops: an after of none or two kinds, a by alone, an on/off flag, a bad id', () => {
    for (const [effect, message] of [
      [later({}), 'gives one of days, choices and flag'],
      [later({ days: 1, choices: 1 }), 'gives one of days, choices and flag'],
      [later({ days: 1, by: 2 }), 'counts a flag’s rise'],
      [later({ days: 0 }), '"days" is a whole number'],
      [later({ flag: 'helped' }), '"helped" is not a number flag'],
      [later({ days: 1 }, { id: 'Debt' }), 'is not lowercase words'],
      [{ effect: 'later', after: { days: 1 } }, '"do" is a list of effects'],
    ] as const) {
      expect(() => attempt(start(), effect as Effect), message).toThrow(message);
    }
  });
});
