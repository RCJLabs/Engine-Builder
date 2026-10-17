/**
 * Two small modules for the kernel tests: a counter that does one odd thing per action, and a
 * bank whose effect can refuse. Between them they reach every rule in docs/specs/sim.md.
 */
import { createGame, createRecordStore, defineModule, type GameState } from '../src/index.ts';

export const sim = { content: createRecordStore({}) };

export interface Counter {
  n: number;
  rolls: number[];
}

export const counter = defineModule<Counter>({
  id: 'counter',
  init: () => ({ n: 0, rolls: [] }),
  actions: {
    add(ctx, action) {
      const slice = ctx.write();
      slice.n += action.by as number;
      ctx.emit('added', { n: slice.n });
    },
    'add-then-refuse'(ctx) {
      ctx.write().n += 100;
      ctx.emit('added', { n: -1 });
      return ctx.refuse('changed-my-mind', { why: 1 });
    },
    pay(ctx, action) {
      ctx.write().n += 1;
      ctx.apply({ effect: 'spend', amount: action.amount });
    },
    peek(ctx) {
      const before = ctx.fact('counter.n');
      ctx.write().n += 5;
      ctx.emit('peeked', { before, after: ctx.fact('counter.n') as number });
    },
    roll(ctx) {
      ctx.write().rolls.push(ctx.rng('dice').int(1, 1000));
    },
    open(ctx, action) {
      ctx.modes.push('menu', { page: action.page });
    },
    close(ctx) {
      ctx.modes.pop();
    },
    swap(ctx) {
      ctx.modes.replace('menu');
    },
    nothing() {},
    nan(ctx) {
      ctx.write().n = Number.NaN;
    },
    'odd-beat'(ctx) {
      ctx.emit('odd', { type: 'hack', when: 1 });
    },
    'nan-beat'(ctx) {
      ctx.emit('odd', { x: Number.NaN });
    },
    'bad-beat-name'(ctx) {
      ctx.emit('Odd Beat');
    },
    loop(ctx) {
      ctx.apply({ effect: 'echo' });
    },
    'unknown-effect'(ctx) {
      ctx.apply({ effect: 'teleport' });
    },
    'unknown-mode'(ctx) {
      ctx.modes.push('limbo');
    },
  },
  facts: { n: ({ state }) => state.n },
  effects: { echo: (ctx) => ctx.apply({ effect: 'echo' }) },
  modes: {
    play: { actions: ['*'] },
    menu: { actions: ['counter/close', 'counter/swap', 'counter/open'] },
  },
});

export interface Bank {
  credits: number;
  rolls: number[];
}

export const bank = defineModule<Bank>({
  id: 'bank',
  init: (ctx) => ({ credits: 10, rolls: [ctx.rng('dice').int(1, 6)] }),
  actions: {
    roll(ctx) {
      ctx.write().rolls.push(ctx.rng('dice').int(1, 6));
    },
  },
  effects: {
    spend(ctx, effect) {
      const slice = ctx.write();
      const amount = effect.amount as number;
      if (slice.credits < amount) return ctx.refuse('no-credits', { credits: slice.credits });
      slice.credits -= amount;
      ctx.emit('spent', { amount });
    },
  },
  facts: { credits: ({ state }) => state.credits },
});

export const game = createGame({ modules: [counter, bank], start: 'play' });
export const start = () => game.init('test-seed', sim);
export const run = (state: GameState, ...actions: Record<string, unknown>[]) =>
  actions.reduce<GameState>((s, a) => game.reduce(s, { type: a.type as string, ...a }, sim).state, state);
export const slice = <T>(state: GameState, id: string) => state[id] as T;
