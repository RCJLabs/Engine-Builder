import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import { createGame, DEBUG, debugModule, debugRun, debugStepsOf, defineModule, type GameState } from './index.ts';

const sim = { content: createRecordStore({}) };

// A purse with an effect that adds to it, refusing to go below nothing. "Open" allows every
// action there is; "shut" allows none, as a game's ending does.
const purse = defineModule<{ coins: number }>({
  id: 'purse',
  init: () => ({ coins: 2 }),
  actions: {
    spend(ctx) {
      ctx.write().coins -= 1;
    },
  },
  effects: {
    add(ctx, effect) {
      const coins = ctx.read().coins + (effect.by as number);
      if (coins < 0) ctx.refuse('too-poor');
      ctx.write().coins = coins;
      ctx.emit('added', { by: effect.by as number });
    },
  },
  modes: { open: { actions: ['*'] }, shut: { actions: [] } },
});

const game = createGame({ modules: [purse, debugModule()], start: 'open' });
const start = () => game.init('s', sim);
const shut = (): GameState => {
  const state = start();
  return { ...state, kernel: { ...state.kernel, modes: [{ id: 'shut' }] } };
};

describe('the debug step', () => {
  it('applies its effects in turn and counts itself', () => {
    const step = game.reduce(
      start(),
      debugRun([
        { effect: 'add', by: 3 },
        { effect: 'add', by: -1 },
      ]),
      sim,
    );
    expect(step.accepted).toBe(true);
    expect(step.state.purse).toEqual({ coins: 4 });
    expect(step.state[DEBUG]).toEqual({ steps: 1 });
    expect(step.beats.map((beat) => beat.type)).toEqual(['purse/added', 'purse/added', 'debug/ran']);
    expect(step.beats.at(-1)).toMatchObject({ effects: 2 });
    expect(step.state.kernel.step).toBe(1);
  });

  it('is refused, changing nothing, when an effect refuses or the list is bad', () => {
    const before = start();
    const poor = game.reduce(
      before,
      debugRun([
        { effect: 'add', by: 1 },
        { effect: 'add', by: -9 },
      ]),
      sim,
    );
    expect(poor).toMatchObject({ accepted: false, state: before });
    expect(poor.beats).toEqual([{ type: 'rejected', action: 'debug/run', reason: 'too-poor' }]);
    for (const effects of [
      [],
      'add',
      [{ by: 1 }],
      [null],
      Array.from({ length: 21 }, () => ({ effect: 'add', by: 0 })),
    ]) {
      const step = game.reduce(before, { type: 'debug/run', effects }, sim);
      expect(step.accepted).toBe(false);
      expect(step.beats[0]).toMatchObject({ reason: 'bad-effects' });
    }
  });

  it('is taken in every mode, one that allows nothing too, and offered in none, not even by "*"', () => {
    expect(game.allowedActions(start())).toEqual(['purse/spend']);
    expect(game.options(start(), sim)).toEqual([{ type: 'purse/spend' }]);
    expect(game.options(shut(), sim)).toEqual([]);
    expect(game.reduce(shut(), { type: 'purse/spend' }, sim).accepted).toBe(false);
    const step = game.reduce(shut(), debugRun([{ effect: 'add', by: 1 }]), sim);
    expect(step.accepted).toBe(true);
    expect(step.state.purse).toEqual({ coins: 3 });
  });

  it('keeps the name "debug" for itself, and no mode can name its action', () => {
    const own = defineModule({ id: 'debug', init: () => ({}) });
    expect(() => createGame({ modules: [own], start: 'open' })).toThrow(/editor's debug step/);
    const naming = defineModule({ id: 'menu', init: () => ({}), modes: { open: { actions: ['debug/*'] } } });
    expect(() => createGame({ modules: [naming, debugModule()], start: 'open' })).toThrow(/matches no action/);
  });

  it('leaves a game without it unchanged, and one with it can still load a state from before it', () => {
    const plain = createGame({ modules: [purse], start: 'open' });
    expect(plain.init('s', sim)).not.toHaveProperty(DEBUG);
    const { state, report } = game.migrate(plain.init('s', sim), sim);
    expect(report.added).toEqual([DEBUG]);
    expect(state[DEBUG]).toEqual({ steps: 0 });
  });
});

describe('debugStepsOf', () => {
  it('counts the snapshot’s steps and the log’s debug actions', () => {
    const after = game.reduce(start(), debugRun([{ effect: 'add', by: 1 }]), sim).state;
    expect(debugStepsOf({ snapshot: start(), log: [] })).toBe(0);
    expect(debugStepsOf({ snapshot: start(), log: [{ type: 'purse/spend' }, debugRun([])] })).toBe(1);
    expect(debugStepsOf({ snapshot: after, log: [debugRun([]), { type: 'purse/spend' }] })).toBe(2);
    // A save from a game without the module, or one that isn't a state at all.
    expect(debugStepsOf({ snapshot: { kernel: {} }, log: [] })).toBe(0);
    expect(debugStepsOf({ snapshot: null, log: [null, 'debug/run'] })).toBe(0);
    expect(debugStepsOf({ snapshot: { debug: { steps: -5 } }, log: [debugRun([])] })).toBe(1);
  });
});
