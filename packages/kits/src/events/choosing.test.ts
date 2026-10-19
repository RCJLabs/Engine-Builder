/**
 * Choosing (docs/specs/events.md#choosing): what each choice shows is the verdict choosing makes,
 * costs are paid once, outcomes are rolled by the table shown, and events opened while one is
 * open wait their turn.
 */
import { type GameState, Rng } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { caravanGame, caravanWith, RECORDS, withRecord } from '../../test/caravan.ts';
import type { EventsSlice } from './types.ts';

const { game, sim, start, apply, attempt, open, choose, fact, view } = caravanGame;
const slice = (state: GameState) => state.events as EventsSlice;
const amount = (state: GameState, resource: string) => fact(state, 'economy.amount', { resource });
const offered = (state: GameState) => game.options(state, sim).map((a) => a.choice);
const accepted = (step: ReturnType<typeof choose>) => {
  if (!step.accepted) throw new Error(`Refused: ${JSON.stringify(step.beats[0])}`);
  return step.state;
};
const spend = (state: GameState, resource: string, by: number) =>
  apply(state, { effect: 'add-resource', resource, by: -by });

describe('an open event', () => {
  it('puts the game in the mode choosing, counted as seen', () => {
    const step = game.reduce(
      start(),
      { type: 'caravan/do', effects: [{ effect: 'open-event', event: 'raiders' }] },
      sim,
    );
    expect(step.beats).toContainEqual({ type: 'events/opened', event: 'raiders' });
    expect(step.state.kernel.modes.at(-1)).toEqual({ id: 'choosing', data: { event: 'raiders' } });
    expect(fact(step.state, 'events.open')).toBe('raiders');
    expect(fact(step.state, 'events.seen', { event: 'raiders' })).toBe(1);
    expect(fact(start(), 'events.open')).toBeUndefined();
    expect(() => open(start(), 'ambush')).toThrow('No event "ambush"');
  });

  it('shows each choice whose If holds, with its cost and what locks it', () => {
    const state = open(start(), 'raiders');
    expect(view(state)).toEqual({
      effect: 'open-event',
      event: 'raiders',
      choices: [
        { id: 'pay', label: 'Pay the toll', cost: { scrap: 30 }, open: true },
        { id: 'flee', label: 'Flee', open: true },
        { id: 'fight', label: 'Fight', open: true },
        { id: 'hide', label: 'Hide', open: true },
      ],
    });
    const poor = open(spend(spend(start(), 'scrap', 28), 'fuel', 2), 'raiders');
    const [pay, flee] = (view(poor) as { choices: Record<string, unknown>[] }).choices;
    expect(pay).toEqual({
      id: 'pay',
      label: 'Pay the toll',
      cost: { scrap: 30 },
      open: false,
      short: { resource: 'scrap', have: 12, need: 30 },
    });
    expect(flee).toEqual({ id: 'flee', label: 'Flee', open: false, needs: RECORDS.event.raiders.choices[1]?.needs });
    const friendly = open(apply(start(), { effect: 'set-flag', flag: 'helped', to: true }), 'raiders');
    expect((view(friendly) as { choices: { id: string }[] }).choices.map((c) => c.id)).toEqual([
      'pay',
      'flee',
      'fight',
      'parley',
      'hide',
    ]);
  });

  it('offers exactly the choices it shows open', () => {
    const states = [
      open(start(), 'raiders'),
      open(spend(start(), 'scrap', 28), 'raiders'),
      open(spend(start(), 'fuel', 2), 'raiders'),
      open(apply(start(), { effect: 'set-flag', flag: 'helped', to: true }), 'raiders'),
      open(spend(start(), 'scrap', 35), 'trader'),
    ];
    for (const state of states) {
      const shown = (view(state) as { choices: { id: string; open: boolean }[] }).choices;
      expect(offered(state)).toEqual(shown.filter((c) => c.open).map((c) => c.id));
      for (const choice of shown) expect(choose(state, choice.id).accepted).toBe(choice.open);
    }
  });

  it('shows outcomes, chances and what they do only when the event shows its odds', () => {
    const trader = view(open(start(), 'trader')) as { choices: Record<string, unknown>[] };
    expect(trader.choices[0]).toMatchObject({
      id: 'buy',
      effects: [{ effect: 'add-resource', resource: 'fuel', from: 3, to: 5 }],
    });
    expect(trader.choices[1]).toMatchObject({
      outcomes: [
        { chance: 50, result: 'A deal.', effects: [{ effect: 'add-resource' }] },
        { chance: 50, result: 'No deal.', effects: [] },
      ],
    });
    const raiders = view(open(start(), 'raiders')) as { choices: Record<string, unknown>[] };
    for (const choice of raiders.choices) {
      expect(choice).not.toHaveProperty('outcomes');
      expect(choice).not.toHaveProperty('effects');
    }
  });
});

describe('choosing', () => {
  it('pays the cost once, closes the event and counts the choice', () => {
    const step = choose(open(start(), 'raiders'), 'pay');
    const state = accepted(step);
    expect(amount(state, 'scrap')).toBe(10);
    expect(state.kernel.modes.map((m) => m.id)).toEqual(['caravan']);
    expect(step.beats).toContainEqual({ type: 'events/chosen', event: 'raiders', choice: 'pay' });
    expect(fact(state, 'events.chose', { event: 'raiders', choice: 'pay' })).toBe(true);
    expect(fact(state, 'events.chose', { event: 'raiders', choice: 'fight' })).toBe(false);
    expect(fact(state, 'events.choices')).toBe(1);
    expect(fact(state, 'events.open')).toBeUndefined();
    expect(slice(state)).not.toHaveProperty('choosing');
    expect(() => fact(state, 'events.chose', { event: 'raiders', choice: 'payy' })).toThrow(
      'The event "raiders" has no choice "payy"',
    );
  });

  it('is refused outside an event, for a choice not there or hidden, locked, or past what the party has', () => {
    expect(choose(start(), 'pay').beats[0]).toMatchObject({ reason: 'mode' });
    const raiders = open(start(), 'raiders');
    expect(choose(raiders, 'surrender').beats[0]).toMatchObject({ reason: 'no-such-choice', choice: 'surrender' });
    expect(choose(raiders, 'parley').beats[0]).toMatchObject({ reason: 'no-such-choice', choice: 'parley' });
    expect(choose(open(spend(start(), 'fuel', 2), 'raiders'), 'flee').beats[0]).toMatchObject({
      reason: 'locked',
      choice: 'flee',
    });
    const short = choose(open(spend(start(), 'scrap', 28), 'raiders'), 'pay');
    expect(short.accepted).toBe(false);
    expect(short.beats[0]).toMatchObject({ reason: 'cant-afford', resource: 'scrap', have: 12, need: 30 });
  });

  it('is refused when one of its effects refuses, and the event stays open with those waiting', () => {
    const medic = apply(start(), { effect: 'open-event', event: 'medic' }, { effect: 'open-event', event: 'trader' });
    const step = choose(medic, 'patch');
    expect(step.accepted).toBe(false);
    expect(step.beats[0]).toMatchObject({ reason: 'not-enough', item: 'medkit' });
    expect(step.state).toBe(medic);
    expect(slice(step.state)).toMatchObject({ open: 'medic', waiting: ['trader'] });
    const stocked = open(apply(start(), { effect: 'give-item', item: 'medkit' }), 'medic');
    expect(accepted(choose(stocked, 'patch')).kernel.modes).toHaveLength(1);
  });

  it('rolls an outcome by the table the odds show, from the stream events/outcome', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const before = open(start(`roll-${i}`), 'raiders');
      const roll = Rng.fromState(
        before.kernel.streams['events/outcome'] ?? Rng.create(`roll-${i}`).fork('events/outcome').toState(),
      ).int(1, 100);
      const step = choose(before, 'fight');
      const outcome = roll <= 60 ? 0 : 1;
      expect(step.beats).toContainEqual({ type: 'events/rolled', event: 'raiders', choice: 'fight', outcome, roll });
      const state = accepted(step);
      expect([amount(state, 'scrap'), amount(state, 'fuel')]).toEqual(outcome === 0 ? [55, 3] : [40, 2]);
      seen.add(outcome);
    }
    expect([...seen].sort()).toEqual([0, 1]);
  });

  it('charges no cost without the economy kit, nor locks a choice by one', () => {
    const toll = { choices: [{ id: 'pay', label: 'Pay the toll', cost: { scrap: 30 } }] };
    const free = caravanWith(withRecord('event', 'raiders', toll), { economy: false });
    const state = free.open(free.start(), 'raiders');
    const shown = (free.view(state) as { choices: Record<string, unknown>[] }).choices;
    expect(shown[0]).toEqual({ id: 'pay', label: 'Pay the toll', cost: { scrap: 30 }, open: true });
    expect(free.choose(state, 'pay').accepted).toBe(true);
  });

  it('can be all a game is: the mode it starts in, its first event opened by a module’s start', () => {
    const story = caravanWith(RECORDS, { start: 'choosing', first: 'trader' });
    const begun = story.start();
    expect(begun.kernel.modes).toEqual([{ id: 'choosing' }, { id: 'choosing', data: { event: 'trader' } }]);
    const over = accepted(story.choose(begun, 'leave'));
    expect(over.kernel.modes).toEqual([{ id: 'choosing' }]);
    // Nothing open and nothing waiting: nothing is offered, and the game is over.
    expect(story.game.options(over, story.sim)).toEqual([]);
    expect(story.choose(over, 'leave').beats[0]).toMatchObject({ reason: 'not-choosing' });
  });
});

describe('events opened while one is open', () => {
  it('wait their turn, in the order opened, and open as the one before is chosen', () => {
    let state = apply(
      start(),
      { effect: 'open-event', event: 'raiders' },
      { effect: 'open-event', event: 'trader' },
      { effect: 'open-event', event: 'quiet' },
    );
    expect(slice(state).waiting).toEqual(['trader', 'quiet']);
    expect(fact(state, 'events.seen', { event: 'trader' })).toBe(0);
    const step = choose(state, 'pay');
    expect(step.beats.filter((b) => b.type === 'events/opened')).toEqual([{ type: 'events/opened', event: 'trader' }]);
    state = accepted(step);
    expect(state.kernel.modes.at(-1)).toEqual({ id: 'choosing', data: { event: 'trader' } });
    state = accepted(choose(state, 'leave'));
    expect(fact(state, 'events.open')).toBe('quiet');
    expect(slice(state).waiting).toEqual([]);
  });

  it('come after an event the choice itself opens', () => {
    const chain = withRecord('event', 'quiet', {
      choices: [{ id: 'go-on', label: 'Go on', effects: [{ effect: 'open-event', event: 'raiders' }] }],
    });
    const g = caravanWith(chain);
    let state = g.apply(g.start(), { effect: 'open-event', event: 'quiet' }, { effect: 'open-event', event: 'trader' });
    state = g.step(state, { type: 'events/choose', choice: 'go-on' });
    expect(g.fact(state, 'events.open')).toBe('raiders');
    expect((state.events as EventsSlice).waiting).toEqual(['trader']);
  });

  it('leave nothing behind in an action that is refused', () => {
    const step = attempt(start(), { effect: 'open-event', event: 'raiders' }, { effect: 'take-item', item: 'medkit' });
    expect(step.accepted).toBe(false);
    expect(slice(step.state)).toMatchObject({ waiting: [], seen: {} });
    expect(step.state.kernel.modes).toHaveLength(1);
  });
});
