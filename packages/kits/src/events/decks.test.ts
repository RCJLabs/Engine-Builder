/**
 * Decks (docs/specs/events.md#decks): each draw is the one the spec's rules give, worked out here
 * by hand from the deck's record and the state, and a deck's draws never shift with another's.
 */
import { type GameState, Rng } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { caravanGame, caravanWith, RECORDS, withRecord } from '../../test/caravan.ts';
import type { EventsSlice } from './types.ts';

const { game, sim, start, step, apply, attempt } = caravanGame;
const slice = (state: GameState) => state.events as EventsSlice;
const travel = (state: GameState) => game.reduce(state, { type: 'caravan/travel' }, sim);
const drawn = (beats: readonly { type: string }[]) =>
  beats.filter((b) => b.type === 'events/drawn').map((b) => (b as unknown as { event: string }).event);

/** Settles the open event by the first choice it offers, as a bot would. */
function settle(state: GameState): GameState {
  let now = state;
  while (slice(now).open !== undefined) now = step(now, game.options(now, sim)[0] as never);
  return now;
}

/** The road's next draw, worked out from its record and the state as the spec says. */
function byHand(state: GameState): string | undefined {
  const { salt, seen, decks, open, waiting } = slice(state);
  const { events, recent: keep, unseen } = RECORDS.deck.road;
  const road = decks.road ?? { draws: 0, recent: [] };
  const recent = road.recent.slice(-keep);
  const live = events.filter(
    (e) =>
      e.event !== open &&
      !waiting.includes(e.event) &&
      !recent.includes(e.event) &&
      !(e.once === true && (seen[e.event] ?? 0) > 0),
  );
  if (live.length === 0) return undefined;
  const weights = live.map((e) => (e.weight ?? 1) * ((seen[e.event] ?? 0) === 0 ? unseen : 1));
  return live[Rng.create(`${salt}/road/${road.draws}`).weightedIndex(weights)]?.event;
}

describe('a deck', () => {
  it('draws what its weights, its once, its recent and its unseen boost give, in 3 games of 30 draws', () => {
    for (const seed of ['road-a', 'road-b', 'road-c']) {
      let state = start(seed);
      const events = new Set<string>();
      for (let n = 0; n < 30; n++) {
        const expected = byHand(state);
        const moved = travel(state);
        expect(drawn(moved.beats)).toEqual(expected === undefined ? [] : [expected]);
        if (expected) events.add(expected);
        expect(slice(moved.state).decks.road?.draws).toBe(n + 1);
        state = settle(moved.state);
      }
      expect([...events].sort()).toEqual(['loan-shark', 'quiet', 'raiders', 'trader']);
      expect(slice(state).seen['loan-shark']).toBe(1);
    }
  });

  it('never draws one of its last draws, an event open or one waiting', () => {
    let state = start('recent');
    let last: string | undefined;
    for (let n = 0; n < 30; n++) {
      const moved = travel(state);
      const [event] = drawn(moved.beats);
      expect(event).not.toBe(last);
      last = event;
      state = settle(moved.state);
    }
    const pair = caravanWith(withRecord('deck', 'pair', { events: [{ event: 'raiders' }, { event: 'quiet' }] }));
    const both = pair.apply(
      pair.start(),
      { effect: 'open-event', event: 'raiders' },
      { effect: 'draw-event', deck: 'pair' },
    );
    expect((both.events as EventsSlice).waiting).toEqual(['quiet']);
    const none = pair.game.reduce(
      pair.start(),
      {
        type: 'caravan/do',
        effects: [
          { effect: 'open-event', event: 'raiders' },
          { effect: 'open-event', event: 'quiet' },
          { effect: 'draw-event', deck: 'pair' },
        ],
      },
      pair.sim,
    );
    expect(none.beats).toContainEqual({ type: 'events/nothing-drawn', deck: 'pair' });
    expect((none.state.events as EventsSlice).decks).toEqual({});
  });

  it('draws an event only while its If holds, and says when nothing can come', () => {
    const none = attempt(start(), { effect: 'draw-event', deck: 'favours' });
    expect(none.beats).toContainEqual({ type: 'events/nothing-drawn', deck: 'favours' });
    expect(slice(none.state).open).toBeUndefined();
    const helped = apply(
      start(),
      { effect: 'set-flag', flag: 'helped', to: true },
      { effect: 'draw-event', deck: 'favours' },
    );
    expect(slice(helped).open).toBe('quiet');
    expect(() => apply(start(), { effect: 'draw-event', deck: 'sea' })).toThrow('No deck "sea"');
  });

  it('draws the same at its nth draw whatever other decks draw or choices roll', () => {
    const records = withRecord('deck', 'road', {
      events: [{ event: 'raiders', weight: 3 }, { event: 'trader', weight: 2 }, { event: 'quiet' }],
    });
    const side = caravanWith({ ...records, deck: { ...records.deck, side: { events: [{ event: 'medic' }] } } });
    const run = (sideDraws: boolean) => {
      let state = side.start('apart');
      const seen: string[] = [];
      for (let n = 0; n < 12; n++) {
        if (sideDraws) {
          state = side.apply(state, { effect: 'draw-event', deck: 'side' });
          state = side.step(state, { type: 'events/choose', choice: 'walk-on' });
        }
        const moved = side.game.reduce(state, { type: 'caravan/travel' }, side.sim);
        seen.push(...drawn(moved.beats));
        state = moved.state;
        // A roll where there is one, so the outcome stream moves on too.
        const open = (state.events as EventsSlice).open;
        const choice = open === 'raiders' ? 'hide' : open === 'trader' ? 'haggle' : 'go-on';
        state = side.step(state, { type: 'events/choose', choice });
      }
      return seen;
    };
    expect(run(true)).toEqual(run(false));
  });
});
