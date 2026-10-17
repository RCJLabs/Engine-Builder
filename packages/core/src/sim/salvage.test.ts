import { describe, expect, it } from 'vitest';
import { botAction, botFor, salvageModules, sim } from '../../test/salvage.ts';
import { canonicalJson } from '../canonical.ts';
import { readFacets, stateHash } from '../stateHash.ts';
import { type Action, createGame, createSession, type GameState } from './index.ts';

const game = createGame({ modules: salvageModules, start: 'travel' });
// A cap in the runner, not just the game: spliceworld once reported a fight that only ended
// around turn 900 as a defeat.
const MAX_ACTIONS = 400;

/** Plays one seed through a session until the game ends or the cap. */
function play(seed: string, from: GameState = game.init(seed, sim), bot = botFor(seed), limit = MAX_ACTIONS) {
  const session = createSession(game, sim, from);
  let actions = 0;
  for (; actions < limit; actions++) {
    const action = botAction(session.state, game.allowedActions(session.state), bot);
    if (!action) break;
    session.dispatch(action as Action);
  }
  return { state: session.state, log: session.log, actions, beats: session.drain() };
}

const replay = (from: GameState, log: readonly Action[]) =>
  log.reduce<GameState>((state, action) => {
    const step = game.reduce(state, action, sim);
    expect(step.accepted).toBe(true);
    return step.state;
  }, from);

const seeds = Array.from({ length: 1000 }, (_, i) => `seed-${i}`);

describe('salvage run, a test-only text game', () => {
  it('plays 1,000 seeds to the same hashes twice', () => {
    const first = seeds.map((seed) => stateHash(play(seed).state));
    const second = seeds.map((seed) => stateHash(play(seed).state));
    expect(second).toEqual(first);
  }, 60_000);

  it('ends every run inside the cap, with seeds that make a difference', () => {
    const runs = seeds.slice(0, 200).map((seed) => play(seed));
    const endings = runs.map((run) => (run.state.voyage as { ending: string | null }).ending);
    expect(endings.every((ending) => ending === 'home' || ending === 'lost')).toBe(true);
    expect(new Set(endings)).toEqual(new Set(['home', 'lost']));
    // The game's own slices, without the seed, still differ between runs.
    const outcomes = new Set(
      runs.map(({ state }) => canonicalJson({ crew: state.crew, hold: state.hold, voyage: state.voyage })),
    );
    expect(outcomes.size).toBeGreaterThan(150);
  });

  it('replays the action log from the start to the same state', () => {
    for (const seed of seeds.slice(0, 50)) {
      const run = play(seed);
      expect(stateHash(replay(game.init(seed, sim), run.log))).toBe(stateHash(run.state));
    }
  });

  it('continues a run saved and reloaded halfway to the same end', () => {
    for (const seed of seeds.slice(0, 50)) {
      const whole = play(seed);
      const half = Math.floor(whole.log.length / 2);
      const saved = canonicalJson(replay(game.init(seed, sim), whole.log.slice(0, half)));
      const loaded = JSON.parse(saved) as GameState;
      expect(stateHash(replay(loaded, whole.log.slice(half)))).toBe(stateHash(whole.state));
    }
  });

  it('gives one facet per module, plus the kernel', () => {
    expect(Object.keys(readFacets(play('seed-0').state))).toEqual(['crew', 'hold', 'kernel', 'voyage']);
  });

  it('tells the stage what happened in beats, with refusals among them', () => {
    const { beats } = play('seed-3');
    const types = new Set(beats.map((beat) => beat.type));
    for (const type of ['voyage/arrived', 'voyage/chose', 'voyage/ended', 'mode', 'rejected'])
      expect(types).toContain(type);
  });
});
