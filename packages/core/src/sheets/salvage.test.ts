/**
 * Salvage run's trigger sheet (records/sheet/voyage.json), played: each row does what it says at
 * the moment it says, a row that refuses is undone while the action stands, and once rows run once.
 */
import { describe, expect, it } from 'vitest';
import { botAction, botFor, game, sim } from '../../test/salvage.ts';
import { type Action, type Beat, createSession, type GameState } from '../sim/index.ts';

const fact = (state: GameState, id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim);
const ran = (beats: readonly Beat[], row: string, type = 'sheet/fired') =>
  beats.some((b) => b.type === type && b.sheet === 'voyage' && b.row === row);

interface Tally {
  met: number;
  tithes: number;
  refusedTithes: number;
  veterans: number;
  debtsDue: number;
}

function check(seed: string, tally: Tally): void {
  const session = createSession(game, sim, game.init(seed, sim));
  const bot = botFor(seed);
  let veteran = 0;
  for (let n = 0; n < 400; n++) {
    const before = session.state;
    const action = botAction(before, game.allowedActions(before), bot);
    if (!action) break;
    const { state, beats, accepted } = session.dispatch(action as Action);
    if (!accepted) continue;
    const metBefore = fact(before, 'flag.on', { flag: 'met-trader' }) === true;
    const atTrader = beats.some((b) => b.type === 'voyage/arrived' && b.event === 'trader');
    expect(ran(beats, 'meet-trader')).toBe(atTrader && !metBefore);
    if (atTrader) expect(fact(state, 'flag.on', { flag: 'met-trader' })).toBe(true);
    if (ran(beats, 'meet-trader')) tally.met++;

    // The trader's tithe: 5 credits a salvage looted, or nothing when the hold can't pay.
    const salvage = beats.some((b) => b.type === 'hold/looted' && b.item === 'salvage');
    const credits = (s: GameState) => fact(s, 'hold.credits') as number;
    if (salvage && metBefore) {
      if (ran(beats, 'tithe')) {
        expect(credits(state)).toBe(credits(before) - 5);
        tally.tithes++;
      } else {
        expect(beats).toContainEqual({ type: 'sheet/refused', sheet: 'voyage', row: 'tithe', reason: 'no-credits' });
        expect(credits(state)).toBe(credits(before));
        tally.refusedTithes++;
      }
    } else {
      expect(ran(beats, 'tithe') || ran(beats, 'tithe', 'sheet/refused')).toBe(false);
    }

    if (ran(beats, 'veteran')) {
      expect(fact(state, 'flag.number', { flag: 'fights' })).toBeGreaterThanOrEqual(3);
      veteran++;
    }
    if (beats.some((b) => b.type === 'time/fired' && b.timer === 'debt')) {
      expect(ran(beats, 'debt-due')).toBe(true);
      expect(fact(state, 'flag.on', { flag: 'owes-raiders' })).toBe(false);
      tally.debtsDue++;
    }
  }
  expect(veteran).toBeLessThanOrEqual(1);
  tally.veterans += veteran;
}

describe("salvage run's trigger sheet", () => {
  it('runs each row when and as it says, over 200 seeds', () => {
    const tally: Tally = { met: 0, tithes: 0, refusedTithes: 0, veterans: 0, debtsDue: 0 };
    for (let i = 0; i < 200; i++) check(`seed-${i}`, tally);
    // Every row, often enough to count. Read on 2026-10-18 over these seeds: 200 met, 335 tithes
    // paid and 258 refused, 151 veterans, 70 debts due. Lower bounds, so the content can change.
    expect(tally.met).toBeGreaterThan(150);
    expect(tally.tithes).toBeGreaterThan(200);
    expect(tally.refusedTithes).toBeGreaterThan(150);
    expect(tally.veterans).toBeGreaterThan(100);
    expect(tally.debtsDue).toBeGreaterThan(40);
  }, 30_000);
});
