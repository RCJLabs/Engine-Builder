import { describe, expect, it } from 'vitest';
import { game, sim } from '../../test/salvage.ts';
import { createRecordStore } from '../records.ts';
import { Rng } from '../rng.ts';
import { createGame, defineModule, type GameState } from '../sim/index.ts';
import { stateHash } from '../stateHash.ts';
import { playRun } from './play.ts';
import { randomPolicy, rulePolicy, weightedPolicy } from './policy.ts';
import { seedsOf, sweep } from './sweep.ts';

const cautious = weightedPolicy('cautious', { 'crew/rest': 3, 'voyage/jump': 1 });

describe('playRun', () => {
  it('plays a seed to its end, and its log replays to the state it reached', () => {
    const run = playRun(game, sim, { seed: 'a', policy: randomPolicy });
    expect(run.end).toBe('ended');
    expect(game.fact(run.state, 'voyage.ending', undefined, sim)).toMatch(/^(home|lost)$/);
    expect(run.refused).toEqual([]);
    let state: GameState = game.init('a', sim);
    for (const action of run.log) state = game.reduce(state, action, sim).state;
    expect(stateHash(state)).toBe(stateHash(run.state));
    expect(run.turns).toBe(run.log.length);
  });

  it('gives the same run for the same seed and policy, and other runs for others', () => {
    const again = (seed: string) => stateHash(playRun(game, sim, { seed, policy: randomPolicy }).state);
    expect(again('b')).toBe(again('b'));
    const hashes = new Set(seedsOf(20).map(again));
    expect(hashes.size).toBe(20);
    const other = stateHash(playRun(game, sim, { seed: 'b', policy: cautious }).state);
    expect(other).not.toBe(again('b'));
  });

  it('draws the bot from a stream of its own, so the policy never shifts the game', () => {
    // The first encounter is drawn by the game's stream, whatever the bot drew before it.
    const firstEvent = (policyName: string, weights: Record<string, number>) => {
      const run = playRun(game, sim, { seed: 'c', policy: weightedPolicy(policyName, weights), maxTurns: 1 });
      return (run.state.kernel.modes[1]?.data as { event?: string } | undefined)?.event;
    };
    expect(firstEvent('a', { 'voyage/jump': 1 })).toBe(firstEvent('b', { 'voyage/jump': 5 }));
  });

  it('stops at the turn cap, when the policy stops, and when nothing is offered', () => {
    expect(playRun(game, sim, { seed: 'd', policy: randomPolicy, maxTurns: 3 })).toMatchObject({
      end: 'capped',
      turns: 3,
    });
    const stopper = { name: 'stopper', choose: () => null };
    expect(playRun(game, sim, { seed: 'd', policy: stopper })).toMatchObject({ end: 'stopped', turns: 0 });
    const never = weightedPolicy('never', { 'voyage/jump': 0 });
    expect(playRun(game, sim, { seed: 'd', policy: never })).toMatchObject({ end: 'stopped', turns: 0 });
  });

  it('throws when a policy makes up an action it was not offered', () => {
    const cheat = { name: 'cheat', choose: () => ({ type: 'voyage/jump' }) };
    expect(() => playRun(game, sim, { seed: 'e', policy: cheat })).toThrow(
      'Policy "cheat" chose an action it was not offered',
    );
  });

  it('records each offer the game refuses, with its reason', () => {
    // A door that offers to open even once it is open: the bug the runner exists to find.
    const door = defineModule<{ open: boolean }>({
      id: 'door',
      init: () => ({ open: false }),
      actions: {
        open: {
          run(ctx) {
            if (ctx.read().open) return ctx.refuse('already-open');
            ctx.write().open = true;
          },
          options: () => [{}],
        },
      },
      modes: { hall: { actions: ['door/open'] } },
    });
    const hall = createGame({ modules: [door], start: 'hall' });
    const run = playRun(hall, { content: createRecordStore({}) }, { seed: 'f', policy: randomPolicy, maxTurns: 3 });
    expect(run.refused).toEqual([
      { turn: 1, action: { type: 'door/open' }, reason: 'already-open' },
      { turn: 2, action: { type: 'door/open' }, reason: 'already-open' },
    ]);
    expect(run.beats).toEqual({ rejected: 2 });
  });
});

describe('rulePolicy', () => {
  const payer = rulePolicy('payer', [
    { when: { fact: 'hold.credits', op: '>=', value: 10 }, prefer: { type: 'voyage/choose', choice: 'pay' } },
    { prefer: { type: 'voyage/choose', choice: 'leave' } },
    { prefer: { type: 'voyage/*' } },
  ]);
  // Salvage run's state at raiders, with the hold at `credits`.
  const atRaiders = (credits: number) => {
    const state = game.init('rules', sim);
    const modes = [{ id: 'travel' }, { id: 'encounter', data: { event: 'raiders' } }];
    return { ...state, kernel: { ...state.kernel, modes }, hold: { credits, items: {} } } as GameState;
  };
  const choose = (state: GameState, seed = 'r') =>
    payer.choose({ state, options: game.options(state, sim), rng: Rng.create(seed), game, sim, turn: 0 });

  it('follows the first rule whose condition holds and that matches an offer', () => {
    expect(choose(atRaiders(20))).toEqual({ type: 'voyage/choose', choice: 'pay' });
  });

  it('passes over a rule that holds but matches nothing, and a pattern takes the rest', () => {
    // Paying is locked under 10 credits and raiders can't be left, so the third rule picks.
    const picks = new Set(seedsOf(40).map((seed) => choose(atRaiders(5), seed)?.choice));
    expect([...picks].sort()).toEqual(['fight', 'promise']);
  });

  it('plays a whole sweep without a refused offer, and never rests while it can jump', () => {
    const { report } = sweep(game, sim, { seeds: seedsOf(50, 'rules'), policy: payer });
    expect(report.refused.count).toBe(0);
    expect(report.beats.find((b) => b.type === 'crew/rested')).toBeUndefined();
  });
});

describe('sweep', () => {
  const metrics = ['voyage.ending', 'crew.alive', 'hold.credits', { fact: 'hold.count', args: { item: 'salvage' } }];
  // A bot that never rests: resting costs salvage run no time, so one that rests when hurt never loses.
  const reckless = weightedPolicy('reckless', { 'crew/rest': 0 });
  const { report, runs } = sweep(game, sim, { seeds: seedsOf(200), policy: reckless, metrics });

  it('plays every seed once and says how each run ended', () => {
    expect(report).toMatchObject({ runs: 200, policy: 'reckless', ends: { ended: 200, stopped: 0, capped: 0 } });
    expect(runs.map((r) => r.seed)).toEqual(seedsOf(200));
    expect(report.refused).toEqual({ count: 0, first: [] });
  });

  it('reads each metric at the end, by its domain: shares with intervals, or numbers', () => {
    const [ending, alive, credits, salvage] = report.metrics;
    expect(ending).toMatchObject({ label: 'voyage.ending', kind: 'values' });
    const shares = ending?.kind === 'values' ? ending.values : [];
    expect(shares.map((v) => v.value).sort()).toEqual(['home', 'lost']);
    expect(shares.reduce((sum, v) => sum + v.runs, 0)).toBe(200);
    for (const v of shares) expect(v.low <= v.share && v.share <= v.high).toBe(true);
    expect(alive).toMatchObject({ label: 'crew.alive', kind: 'number', none: 0 });
    expect(alive?.kind === 'number' && alive.summary?.n).toBe(200);
    expect(credits?.kind).toBe('number');
    expect(salvage?.label).toBe('hold.count({"item":"salvage"})');
  });

  it('counts the runs that reached each beat type', () => {
    const ended = report.beats.find((b) => b.type === 'voyage/ended');
    expect(ended).toMatchObject({ runs: 200, share: 1 });
    expect(report.beats.map((b) => b.type)).toEqual([...report.beats.map((b) => b.type)].sort());
  });

  it('keeps for each run the hashes golden files need', () => {
    const run = playRun(game, sim, { seed: 'seed-7', policy: reckless });
    expect(runs[7]).toMatchObject({ seed: 'seed-7', hash: stateHash(run.state), turns: run.turns, end: 'ended' });
    expect(Object.keys(runs[7]?.facets ?? {}).sort()).toEqual(['crew', 'hold', 'kernel', 'logic', 'time', 'voyage']);
  });

  it('gives the same report every time', () => {
    expect(sweep(game, sim, { seeds: seedsOf(200), policy: reckless, metrics }).report).toEqual(report);
  });

  it('refuses a seed given twice', () => {
    expect(() => sweep(game, sim, { seeds: ['a', 'a'], policy: randomPolicy })).toThrow('seeds must be distinct');
  });
});
