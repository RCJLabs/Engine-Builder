import { describe, expect, it } from 'vitest';
import { createRecordStore, type RecordPack } from '../records.ts';
import { createGame, defineModule, type Effect, type GameState } from '../sim/index.ts';
import { flagModule } from './flags.ts';

const FLAGS: RecordPack['flag'] = {
  'met-trader': { name: 'Met the trader' },
  raids: { number: { min: 0, max: 3 } },
  debt: { number: { start: 5 } },
};

/** Applies the effects it is given, so each test can drive the flag module through them. */
const driver = defineModule<Record<string, never>>({
  id: 'driver',
  init: () => ({}),
  actions: {
    apply(ctx, action) {
      for (const effect of action.effects as Effect[]) ctx.apply(effect);
    },
  },
  modes: { play: { actions: ['*'] } },
});

const game = createGame({ modules: [driver, flagModule], start: 'play' });

function setup(flags: RecordPack['flag'] = FLAGS) {
  const sim = { content: createRecordStore({ flag: flags }) };
  let state: GameState = game.init('seed', sim);
  const apply = (...effects: Effect[]) => {
    const step = game.reduce(state, { type: 'driver/apply', effects }, sim);
    state = step.state;
    return step;
  };
  return {
    sim,
    apply,
    get state() {
      return state;
    },
    on: (flag: string) => game.fact(state, 'flag.on', { flag }, sim),
    number: (flag: string) => game.fact(state, 'flag.number', { flag }, sim),
  };
}

describe('flag facts', () => {
  it('start off, or at their start (0 when left out)', () => {
    const t = setup();
    expect(t.on('met-trader')).toBe(false);
    expect(t.number('raids')).toBe(0);
    expect(t.number('debt')).toBe(5);
    expect(t.state.flag).toEqual({ values: {} });
  });

  it('have no value for a flag of the other kind, or no flag at all', () => {
    const t = setup();
    expect(t.on('raids')).toBeUndefined();
    expect(t.number('met-trader')).toBeUndefined();
    expect(t.on('nobody')).toBeUndefined();
  });

  it('are read with the catalog conditions are checked against', () => {
    expect(game.catalog()['flag.on']).toMatchObject({
      args: { flag: { type: 'ref', to: 'flag' } },
      domain: { type: 'bool' },
    });
    expect(game.catalog()['flag.number']).toMatchObject({ domain: { type: 'int' } });
    expect(Object.keys(game.events())).toEqual(['flag/changed']);
  });
});

describe('set-flag and add-to-flag', () => {
  it('change the value and raise flag/changed, keeping only what differs from the start', () => {
    const t = setup();
    expect(t.apply({ effect: 'set-flag', flag: 'met-trader', to: true }).beats).toEqual([
      { type: 'flag/changed', flag: 'met-trader' },
    ]);
    expect(t.on('met-trader')).toBe(true);
    t.apply({ effect: 'add-to-flag', flag: 'debt', by: -2 });
    expect(t.state.flag).toEqual({ values: { 'met-trader': true, debt: 3 } });
    t.apply({ effect: 'set-flag', flag: 'met-trader', to: false }, { effect: 'set-flag', flag: 'debt', to: 5 });
    expect(t.state.flag).toEqual({ values: {} });
  });

  it('raise nothing and write nothing when the value stays the same', () => {
    const t = setup();
    const before = t.state.flag;
    const step = t.apply(
      { effect: 'set-flag', flag: 'met-trader', to: false },
      { effect: 'add-to-flag', flag: 'debt', by: 0 },
    );
    expect(step.beats).toEqual([]);
    expect(t.state.flag).toBe(before);
  });

  it('keep a number within its bounds, raising nothing at a bound', () => {
    const t = setup();
    t.apply({ effect: 'add-to-flag', flag: 'raids', by: 10 });
    expect(t.number('raids')).toBe(3);
    expect(t.apply({ effect: 'add-to-flag', flag: 'raids', by: 1 }).beats).toEqual([]);
    t.apply({ effect: 'set-flag', flag: 'raids', to: -4 });
    expect(t.number('raids')).toBe(0);
    // No bounds: any whole number.
    t.apply({ effect: 'add-to-flag', flag: 'debt', by: -100 });
    expect(t.number('debt')).toBe(-95);
  });

  it('throw on a flag that is missing or of the other kind: validation stops those', () => {
    const t = setup();
    expect(() => t.apply({ effect: 'set-flag', flag: 'nobody', to: true })).toThrow('set-flag: no flag "nobody"');
    expect(() => t.apply({ effect: 'set-flag', flag: 'met-trader', to: 1 })).toThrow('"met-trader" is on or off');
    expect(() => t.apply({ effect: 'set-flag', flag: 'raids', to: true })).toThrow('"raids" is a number');
    expect(() => t.apply({ effect: 'set-flag', flag: 'raids', to: 1.5 })).toThrow('"raids" is a number');
    expect(() => t.apply({ effect: 'add-to-flag', flag: 'met-trader', by: 1 })).toThrow(
      'add-to-flag: flag "met-trader" is on or off',
    );
    expect(() => t.apply({ effect: 'add-to-flag', flag: 'raids', by: 0.5 })).toThrow('"by" is a whole number');
  });

  it('preview what they would leave the flag at', () => {
    const t = setup();
    t.apply({ effect: 'add-to-flag', flag: 'raids', by: 2 });
    expect(
      game.preview(
        t.state,
        [
          { effect: 'add-to-flag', flag: 'raids', by: 5 },
          { effect: 'set-flag', flag: 'met-trader', to: true },
        ],
        t.sim,
      ),
    ).toEqual([
      { effect: 'add-to-flag', flag: 'raids', from: 2, to: 3 },
      { effect: 'set-flag', flag: 'met-trader', from: false, to: true },
    ]);
  });
});

describe('a content update', () => {
  it('reaches the flags a game never changed, and holds saved numbers within the new bounds', () => {
    const t = setup();
    t.apply({ effect: 'add-to-flag', flag: 'raids', by: 3 });
    const updated = {
      content: createRecordStore({ flag: { ...FLAGS, raids: { number: { max: 2 } }, debt: { number: { start: 7 } } } }),
    };
    expect(game.fact(t.state, 'flag.number', { flag: 'raids' }, updated)).toBe(2);
    expect(game.fact(t.state, 'flag.number', { flag: 'debt' }, updated)).toBe(7);
    // A flag that became on or off reads off rather than its old number.
    const turned = { content: createRecordStore({ flag: { ...FLAGS, raids: {} } }) };
    expect(game.fact(t.state, 'flag.on', { flag: 'raids' }, turned)).toBe(false);
  });
});
