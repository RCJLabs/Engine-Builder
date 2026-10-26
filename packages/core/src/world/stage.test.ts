/**
 * The world's stage for headless runs (M6.9, D81, docs/specs/runner.md#a-walked-games-stage-m69-d81):
 * the uses and zones of the player's space, kept only when the sim takes them, offered after the
 * game's own options, and a run that walks a glen with nothing else on offer.
 */
import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import { Rng } from '../rng.ts';
import { playRun } from '../runner/play.ts';
import { randomPolicy, turnFor } from '../runner/policy.ts';
import { joinStages, type Stage, stageOptions } from '../runner/stage.ts';
import { seedsOf, sweep } from '../runner/sweep.ts';
import { flagModule } from '../sheets/flags.ts';
import { createGame, defineModule, type GameState } from '../sim/index.ts';
import { spaceOf, worldStage } from './stage.ts';
import { type WorldData, worldModule } from './world.ts';

const WORLD: WorldData = {
  triggers: {
    glen: { 'bothy-door': { effects: [{ effect: 'enter-space', space: 'bothy' }] } },
    bothy: { hearth: { effects: [{ effect: 'set-flag', flag: 'warm', to: true }], once: true } },
  },
  uses: {
    glen: {
      rope: { label: 'Take', effects: [{ effect: 'add-to-flag', flag: 'ropes', by: 1 }], takes: true },
      gate: { label: 'Open', when: { fact: 'flag.on', args: { flag: 'warm' } }, effects: [] },
      trap: { label: 'Take', effects: [{ effect: 'toll' }], takes: true },
    },
    bothy: { door: { label: 'Open', effects: [{ effect: 'enter-space', space: 'glen' }] } },
  },
  spawns: { glen: [], bothy: [] },
  start: 'glen',
  actors: {},
};

const glen = defineModule<object>({
  id: 'glen',
  init: () => ({}),
  effects: { toll: (ctx) => ctx.refuse('broke') },
  actions: { rest: { run: () => {}, options: () => [{}] } },
  modes: { out: { actions: ['world/*', 'glen/*'] } },
});

const sim = { content: createRecordStore({ flag: { warm: {}, ropes: { number: { min: 0, max: 9 } } } }) };
const game = createGame({ modules: [flagModule, worldModule(WORLD), glen], start: 'out' });
const stage = worldStage(WORLD);
const kept = (state: GameState) => stageOptions(stage, game, sim, state);
const take = (state: GameState, action: Record<string, unknown>) => {
  const step = game.reduce(state, action as never, sim);
  if (!step.accepted) throw new Error(`refused ${String(action.type)}`);
  return step.state;
};
const use = (space: string, object: string) => ({ type: 'world/use', space, object });
const zone = (space: string, object: string) => ({ type: 'world/trigger', space, object });

describe('the world’s stage', () => {
  it('sends the uses then the zones of the player’s space, each in name order', () => {
    const state = game.init('glen', sim);
    expect(spaceOf(state)).toBe('glen');
    expect(stage.name).toBe('walk');
    expect(stage.candidates(state, game, sim)).toEqual([
      use('glen', 'gate'),
      use('glen', 'rope'),
      use('glen', 'trap'),
      zone('glen', 'bothy-door'),
    ]);
  });

  it('keeps only what the sim takes: no use whose when fails, none refused, nothing taken twice', () => {
    let state = game.init('glen', sim);
    expect(kept(state)).toEqual([use('glen', 'rope'), zone('glen', 'bothy-door')]);
    state = take(state, use('glen', 'rope'));
    expect(kept(state)).toEqual([zone('glen', 'bothy-door')]);
    // In the bothy, its own: the hearth's zone once, and the door back.
    state = take(state, zone('glen', 'bothy-door'));
    expect(kept(state)).toEqual([use('bothy', 'door'), zone('bothy', 'hearth')]);
    state = take(state, zone('bothy', 'hearth'));
    expect(kept(state)).toEqual([use('bothy', 'door')]);
    // Warm now, the gate opens.
    state = take(state, use('bothy', 'door'));
    expect(kept(state)).toEqual([use('glen', 'gate'), zone('glen', 'bothy-door')]);
  });

  it('sends nothing in a game without the world', () => {
    const indoors = defineModule<object>({
      id: 'indoors',
      init: () => ({}),
      actions: { rest: { run: () => {}, options: () => [{}] } },
      modes: { in: { actions: ['indoors/*'] } },
    });
    const bare = createGame({ modules: [flagModule, indoors], start: 'in' });
    const state = bare.init('glen', sim);
    expect(spaceOf(state)).toBeUndefined();
    expect(stage.candidates(state, bare, sim)).toEqual([]);
  });

  it('is offered after the game’s own options, and only to a run that has it', () => {
    const state = game.init('glen', sim);
    const options = (s?: Stage) => turnFor(game, sim, state, Rng.create('bot'), 0, s).options;
    expect(options()).toEqual([{ type: 'glen/rest' }]);
    expect(options(stage)).toEqual([{ type: 'glen/rest' }, use('glen', 'rope'), zone('glen', 'bothy-door')]);
  });

  it('lets a bot walk the glen: the rope taken, the bothy warmed, and nothing refused', () => {
    const run = playRun(game, sim, { seed: 'walk', policy: randomPolicy, maxTurns: 200, stage });
    expect(run.refused).toEqual([]);
    expect(run.log.map((a) => a.type)).toContain('world/use');
    const without = playRun(game, sim, { seed: 'walk', policy: randomPolicy, maxTurns: 200 });
    expect(without.log.every((a) => a.type === 'glen/rest')).toBe(true);
    // Over a few seeds the bot finds every object: the rope, the hearth and the gate.
    const reached = new Set<string>();
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const r = playRun(game, sim, { seed, policy: randomPolicy, maxTurns: 200, stage });
      for (const a of r.log) if (a.type !== 'glen/rest') reached.add(String(a.object));
    }
    expect([...reached].sort()).toEqual(['bothy-door', 'door', 'gate', 'hearth', 'rope']);
  });
});

describe('a sweep with a stage', () => {
  it('plays every run with it, and names it in the report', () => {
    const { report } = sweep(game, sim, { seeds: seedsOf(10), policy: randomPolicy, maxTurns: 50, stage });
    expect(report.stage).toBe('walk');
    expect(report.refused.count).toBe(0);
    // Uses and zones, which only the stage sends.
    const runsWith = (type: string) => report.beats.find((b) => b.type === type)?.runs ?? 0;
    expect(runsWith('world/used')).toBeGreaterThan(0);
    expect(runsWith('world/entered')).toBeGreaterThan(0);
    expect(sweep(game, sim, { seeds: seedsOf(10), policy: randomPolicy, maxTurns: 50 }).report.stage).toBeUndefined();
  });
});

describe('stages joined', () => {
  it('send each one’s candidates after the one before’s, under their names joined by "+"', () => {
    const rest: Stage = { name: 'rest', candidates: () => [{ type: 'glen/rest' }] };
    const both = joinStages([stage, rest]);
    expect(both.name).toBe('walk+rest');
    expect(both.candidates(game.init('glen', sim), game, sim).map((a) => a.type)).toEqual([
      'world/use',
      'world/use',
      'world/use',
      'world/trigger',
      'glen/rest',
    ]);
  });
});
