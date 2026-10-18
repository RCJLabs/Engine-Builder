import { describe, expect, it } from 'vitest';
import { createRecordStore, type RecordPack } from '../records.ts';
import { type Beat, createGame, defineModule, type GameState, MAX_EVENT_DEPTH } from '../sim/index.ts';
import { timeModule } from '../time/module.ts';
import { flagModule } from './flags.ts';
import { sheetModule } from './sheets.ts';

/** A port to dock at and a purse to pay from: an event with an argument, and an effect that refuses. */
const dock = defineModule<{ credits: number }>({
  id: 'dock',
  init: () => ({ credits: 8 }),
  events: { arrived: { args: { port: { type: 'text' } } } },
  actions: {
    arrive(ctx, action) {
      ctx.emit('arrived', { port: action.port as string });
    },
  },
  effects: {
    pay(ctx, effect) {
      const slice = ctx.write();
      slice.credits -= effect.amount as number;
      ctx.emit('paid', { amount: effect.amount as number });
      if (slice.credits < 0) ctx.refuse('broke');
    },
  },
  facts: { credits: { read: ({ state }) => state.credits, domain: { type: 'int' } } },
  modes: { play: { actions: ['*'] } },
});

const modules = [dock, timeModule({ calendar: { ticksPerDay: 1 } }), flagModule, sheetModule];
const game = createGame({ modules, start: 'play' });

const FLAGS = { 'met-trader': {}, visits: { number: { min: 0, max: 5 } } };
const on = (flag: string) => ({ fact: 'flag.on', args: { flag } });

function play(sheets: RecordPack['sheet'], flags: RecordPack['flag'] = FLAGS) {
  const sim = { content: createRecordStore({ flag: flags, sheet: sheets }) };
  let state: GameState = game.init('seed', sim);
  return {
    act(action: Record<string, unknown> & { type: string }) {
      const step = game.reduce(state, action, sim);
      state = step.state;
      return step;
    },
    arrive(port = 'kessel') {
      return this.act({ type: 'dock/arrive', port });
    },
    get state() {
      return state;
    },
    fact: (id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
  };
}

const rowBeats = (beats: readonly Beat[]) =>
  beats.filter((b) => b.type.startsWith('sheet/')).map((b) => `${b.type} ${b.sheet}/${b.row}`);

describe('a row', () => {
  it('runs when its event is raised with the argument values it asks for', () => {
    const t = play({
      trader: {
        rows: [
          {
            id: 'meet',
            when: { event: 'dock/arrived', args: { port: 'kessel' } },
            do: [{ effect: 'set-flag', flag: 'met-trader', to: true }],
          },
        ],
      },
    });
    expect(t.arrive('tarsis').beats).toEqual([{ type: 'dock/arrived', port: 'tarsis' }]);
    expect(t.fact('flag.on', { flag: 'met-trader' })).toBe(false);
    expect(t.arrive('kessel').beats).toEqual([
      { type: 'dock/arrived', port: 'kessel' },
      { type: 'sheet/fired', sheet: 'trader', row: 'meet' },
      { type: 'flag/changed', flag: 'met-trader' },
    ]);
    expect(t.fact('flag.on', { flag: 'met-trader' })).toBe(true);
  });

  it('runs only while its condition is true, unknown counting as false', () => {
    const t = play({
      gate: {
        rows: [
          { id: 'met', when: { event: 'dock/arrived' }, if: on('met-trader'), do: [{ effect: 'pay', amount: 1 }] },
          // A number flag has no on or off, so this condition is unknown.
          { id: 'unknown', when: { event: 'dock/arrived' }, if: on('visits'), do: [{ effect: 'pay', amount: 1 }] },
        ],
      },
    });
    expect(rowBeats(t.arrive().beats)).toEqual([]);
    expect(t.fact('dock.credits')).toBe(8);
  });

  it('runs every time, unless it runs once, which the save remembers', () => {
    const t = play({
      count: {
        rows: [
          { id: 'every', when: { event: 'dock/arrived' }, do: [{ effect: 'add-to-flag', flag: 'visits', by: 1 }] },
          { id: 'first', when: { event: 'dock/arrived' }, do: [{ effect: 'pay', amount: 1 }], once: true },
        ],
      },
    });
    t.arrive();
    t.arrive();
    t.arrive();
    expect(t.fact('flag.number', { flag: 'visits' })).toBe(3);
    expect(t.fact('dock.credits')).toBe(7);
    expect(t.state.sheet).toEqual({ fired: ['count/first'] });
  });
});

describe('rows of one event', () => {
  it('run sheets in id order and rows in the order written', () => {
    const row = (id: string) => ({ id, when: { event: 'dock/arrived' }, do: [] });
    const t = play({ zed: { rows: [row('z1'), row('z2')] }, alpha: { rows: [row('b'), row('a')] } });
    expect(rowBeats(t.arrive().beats)).toEqual([
      'sheet/fired alpha/b',
      'sheet/fired alpha/a',
      'sheet/fired zed/z1',
      'sheet/fired zed/z2',
    ]);
  });

  it('run depth first: what one row raises is heard before the next row runs', () => {
    const t = play({
      a: {
        rows: [
          { id: 'meet', when: { event: 'dock/arrived' }, do: [{ effect: 'set-flag', flag: 'met-trader', to: true }] },
          { id: 'after', when: { event: 'dock/arrived' }, do: [] },
        ],
      },
      b: {
        rows: [
          { id: 'heard', when: { event: 'flag/changed', args: { flag: 'met-trader' } }, do: [] },
          { id: 'fired', when: { event: 'sheet/fired', args: { sheet: 'a', row: 'after' } }, do: [] },
        ],
      },
    });
    expect(rowBeats(t.arrive().beats)).toEqual([
      'sheet/fired a/meet',
      'sheet/fired b/heard',
      'sheet/fired a/after',
      'sheet/fired b/fired',
    ]);
  });
});

describe('a row that refuses', () => {
  it('is undone, with a sheet/refused beat, and the action stands', () => {
    const t = play({
      toll: {
        rows: [
          {
            id: 'pay',
            when: { event: 'dock/arrived' },
            do: [
              { effect: 'set-flag', flag: 'met-trader', to: true },
              { effect: 'pay', amount: 20 },
            ],
            once: true,
          },
          { id: 'next', when: { event: 'dock/arrived' }, do: [{ effect: 'pay', amount: 3 }] },
        ],
      },
    });
    const step = t.arrive();
    expect(step.accepted).toBe(true);
    expect(step.beats).toEqual([
      { type: 'dock/arrived', port: 'kessel' },
      { type: 'sheet/refused', sheet: 'toll', row: 'pay', reason: 'broke' },
      { type: 'sheet/fired', sheet: 'toll', row: 'next' },
      { type: 'dock/paid', amount: 3 },
    ]);
    expect(t.fact('flag.on', { flag: 'met-trader' })).toBe(false);
    expect(t.fact('dock.credits')).toBe(5);
    // Not used up: a once row that refused hasn't run.
    expect(t.state.sheet).toEqual({ fired: [] });
  });
});

describe('rows and time', () => {
  it('hear a timer at its tick, not at the end of the wait that reached it', () => {
    const t = play({
      clock: {
        rows: [
          {
            id: 'set',
            when: { event: 'dock/arrived' },
            do: [{ effect: 'schedule', after: { days: 2 }, timer: 'debt', effects: [] }],
            once: true,
          },
          {
            id: 'debt-due',
            when: { event: 'time/fired', args: { timer: 'debt' } },
            if: { fact: 'time.tick', op: '==', value: 2 },
            do: [{ effect: 'set-flag', flag: 'met-trader', to: true }],
          },
        ],
      },
    });
    t.arrive();
    t.act({ type: 'time/advance', days: 5 });
    expect(t.fact('time.tick')).toBe(5);
    expect(t.fact('flag.on', { flag: 'met-trader' })).toBe(true);
  });
});

describe('a row that raises the event it hears', () => {
  it(`throws once rows run ${MAX_EVENT_DEPTH} deep`, () => {
    const t = play({
      loop: {
        rows: [
          {
            id: 'flip',
            when: { event: 'flag/changed', args: { flag: 'met-trader' } },
            if: on('met-trader'),
            do: [{ effect: 'set-flag', flag: 'met-trader', to: false }],
          },
          {
            id: 'flop',
            when: { event: 'flag/changed', args: { flag: 'met-trader' } },
            if: { not: on('met-trader') },
            do: [{ effect: 'set-flag', flag: 'met-trader', to: true }],
          },
          { id: 'start', when: { event: 'dock/arrived' }, do: [{ effect: 'set-flag', flag: 'met-trader', to: true }] },
        ],
      },
    });
    // Each row's sheet/fired is heard too, so the limit can fall on either event.
    expect(() => t.arrive()).toThrow(`Events raised ${MAX_EVENT_DEPTH} deep`);
  });
});
