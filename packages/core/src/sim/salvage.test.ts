import { describe, expect, it } from 'vitest';
import { botAction, botFor, type Choice, content, game, offered, sim } from '../../test/salvage.ts';
import { canonicalJson } from '../canonical.ts';
import { readFacets, stateHash } from '../stateHash.ts';
import { type Action, createSession, type GameState } from './index.ts';

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
    expect(Object.keys(readFacets(play('seed-0').state))).toEqual([
      'crew',
      'hold',
      'kernel',
      'logic',
      'time',
      'voyage',
    ]);
  });

  it('tells the stage what happened in beats, with refusals among them', () => {
    const { beats } = play('seed-3');
    const types = new Set(beats.map((beat) => beat.type));
    for (const type of ['voyage/arrived', 'voyage/chose', 'logic/rolled', 'voyage/ended', 'mode', 'rejected'])
      expect(types).toContain(type);
  });
});

describe('salvage run: conditions and previews', () => {
  const current = (state: GameState) => state.kernel.modes[state.kernel.modes.length - 1]?.data as { event: string };
  const choiceOf = (event: string, id: string) =>
    content.getOrThrow<{ choices: Record<string, Choice> }>('event', event).choices[id] as Choice;

  it('offers only the choices the sim allows, so a bot that takes them is never refused one', () => {
    for (const seed of seeds.slice(0, 200)) {
      const rejected = play(seed).beats.filter((beat) => beat.type === 'rejected');
      expect(rejected.filter((beat) => beat.action === 'voyage/choose')).toEqual([]);
    }
  });

  it('refuses a locked choice and keeps the state it was given', () => {
    // At the trader with nothing to sell, as a save could hold it.
    const start = game.init('locked', sim);
    const modes = [{ id: 'travel' }, { id: 'encounter', data: { event: 'trader' } }];
    const state: GameState = JSON.parse(JSON.stringify({ ...start, kernel: { ...start.kernel, modes } }));
    expect(game.fact(state, 'hold.count', { item: 'salvage' }, sim)).toBe(0);
    expect(offered(state, 'trader')).toEqual(['leave']);
    const step = game.reduce(state, { type: 'voyage/choose', choice: 'sell' }, sim);
    expect(step).toEqual({
      state,
      beats: [{ type: 'rejected', action: 'voyage/choose', reason: 'locked', event: 'trader', choice: 'sell' }],
      accepted: false,
    });
  });

  it('rolls the odds its preview shows, and heals what its preview says', () => {
    let checked = 0;
    for (const seed of seeds.slice(0, 100)) {
      const session = createSession(game, sim, game.init(seed, sim));
      const bot = botFor(seed);
      for (let n = 0; n < MAX_ACTIONS; n++) {
        const before = session.state;
        const action = botAction(before, game.allowedActions(before), bot);
        if (!action) break;
        const choice =
          action.type === 'voyage/choose' ? choiceOf(current(before).event, action.choice as string) : undefined;
        const preview = choice ? game.preview(before, choice.effects, sim) : [];
        const step = session.dispatch(action as Action);
        const rolled = step.beats.find((beat) => beat.type === 'logic/rolled');
        if (rolled) {
          const outcomes = preview[0]?.outcomes as { chance: number }[];
          expect(outcomes[rolled.outcome as number]?.chance).toBe(rolled.chance);
          checked++;
        }
        if (preview[0]?.effect === 'heal') {
          const hp = (state: GameState) => (state.crew as { members: Record<string, { hp: number }> }).members;
          const gains = Object.fromEntries(
            Object.entries(hp(before))
              .filter(([, m]) => m.hp > 0)
              .map(([id, m]) => [id, (hp(step.state)[id]?.hp ?? 0) - m.hp]),
          );
          expect(gains).toEqual(preview[0].gains);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});

describe('salvage run: time', () => {
  it('refuses a debt the hold cannot pay when it falls due, and the day passes all the same', () => {
    let refused = 0;
    let paid = 0;
    for (const seed of seeds.slice(0, 100)) {
      const session = createSession(game, sim, game.init(seed, sim));
      const bot = botFor(seed);
      for (let n = 0; n < MAX_ACTIONS; n++) {
        const before = session.state;
        const action = botAction(before, game.allowedActions(before), bot);
        if (!action) break;
        const step = session.dispatch(action as Action);
        const due = step.beats.find((beat) => beat.timer === 'debt' && beat.type !== 'time/scheduled');
        if (!due) continue;
        const credits = (state: GameState) => game.fact(state, 'hold.credits', undefined, sim) as number;
        expect(game.fact(step.state, 'time.day', undefined, sim)).toBe(
          (game.fact(before, 'time.day', undefined, sim) as number) + 1,
        );
        if (due.type === 'time/refused') {
          expect(due.reason).toBe('no-credits');
          expect(credits(step.state)).toBe(credits(before));
          refused++;
        } else {
          expect(credits(step.state)).toBe(credits(before) - 15);
          paid++;
        }
      }
    }
    expect(refused).toBeGreaterThan(50);
    expect(paid).toBeGreaterThan(50);
  });
});
