import { describe, expect, it } from 'vitest';
import type { Condition } from '../logic/index.ts';
import { createRecordStore } from '../records.ts';
import { createGame, defineModule, type Effect, factCatalog } from './index.ts';

interface Hold {
  credits: number;
  items: Record<string, number>;
  leader: string | null;
}

const hold = defineModule<Hold>({
  id: 'hold',
  init: () => ({ credits: 10, items: { medkit: 1 }, leader: null }),
  actions: {
    buy(ctx, action) {
      const slice = ctx.write();
      slice.credits -= 5;
      ctx.emit('bought', { open: ctx.check(action.when as Condition) });
    },
    set(ctx, action) {
      Object.assign(ctx.write(), action.to);
    },
  },
  facts: {
    credits: { read: ({ state }) => state.credits, domain: { type: 'int', min: 0 }, label: 'credits' },
    count: {
      read: ({ state }, args) => state.items[args.item as string] ?? 0,
      args: { item: { type: 'ref', to: 'item' } },
      domain: { type: 'int', min: 0 },
    },
    leader: { read: ({ state }) => state.leader, domain: { type: 'ref', to: 'actor' } },
    rich: ({ state }) => state.credits > 50,
  },
  effects: {
    spend: {
      run(ctx, effect) {
        ctx.write().credits -= effect.amount as number;
      },
      preview: (ctx, effect) => ({
        effect: 'ignored',
        after: ctx.read().credits - (effect.amount as number),
        allowed: ctx.check({ fact: 'hold.credits', op: '>=', value: effect.amount as number }),
      }),
    },
    plain() {},
    echo: { run() {}, preview: (ctx) => ({ inner: ctx.preview({ effect: 'echo' }) }) },
    odd: { run() {}, preview: () => ({ x: Number.NaN }) },
  },
  modes: { play: { actions: ['*'] } },
});

const sim = { content: createRecordStore({ item: { medkit: {} }, actor: { kit: {} } }) };
const game = createGame({ modules: [hold], start: 'play' });
const start = game.init('conditions', sim);
const credits = (op: '==' | '>=', value: number): Condition => ({ fact: 'hold.credits', op, value });

describe('conditions in the kernel', () => {
  it('checks a condition through the changes made earlier in the same action', () => {
    const step = game.reduce(start, { type: 'hold/buy', when: credits('==', 5) }, sim);
    expect(step.beats).toEqual([{ type: 'hold/bought', open: true }]);
    expect(game.check(start, credits('==', 5), sim)).toBe(false);
    expect(game.check(step.state, credits('==', 5), sim)).toBe(true);
  });

  it('gives unknown for a fact with no value, as the sim does', () => {
    const leader: Condition = { fact: 'hold.leader', op: '==', value: 'kit' };
    expect(game.check(start, leader, sim)).toBeNull();
    expect(game.check(start, { not: leader }, sim)).toBeNull();
    const step = game.reduce(start, { type: 'hold/buy', when: { not: leader } }, sim);
    expect(step.beats).toEqual([{ type: 'hold/bought', open: null }]);
  });

  it('throws when a fact answers outside its domain, in an action or out of one', () => {
    const broke = game.reduce(start, { type: 'hold/set', to: { credits: -1 } }, sim).state;
    expect(() => game.fact(broke, 'hold.credits', undefined, sim)).toThrow(
      'Fact "hold.credits" answered -1, outside its domain: Expected at least 0',
    );
    expect(() => game.reduce(broke, { type: 'hold/buy', when: credits('>=', 0) }, sim)).toThrow('outside its domain');
    const ghost = game.reduce(start, { type: 'hold/set', to: { leader: 'ghost' } }, sim).state;
    expect(() => game.check(ghost, { fact: 'hold.leader', op: '==', value: 'kit' }, sim)).toThrow(
      'Fact "hold.leader" answered "ghost", outside its domain: No actor record "ghost"',
    );
  });

  it('lists every fact in its catalog, sorted, with what its module says and nothing else', () => {
    const catalog = game.catalog();
    expect(Object.keys(catalog)).toEqual(['hold.count', 'hold.credits', 'hold.leader', 'hold.rich']);
    expect(catalog['hold.credits']).toEqual({ domain: { type: 'int', min: 0 }, label: 'credits' });
    expect(catalog['hold.rich']).toEqual({});
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(factCatalog([hold])).toEqual(catalog);
  });
});

describe('previews', () => {
  it('shows an effect as written when its module has no preview for it', () => {
    const effect: Effect = { effect: 'plain', n: 3 };
    expect(game.preview(start, [effect], sim)).toEqual([effect]);
  });

  it("reads the state through the module's preview, and keeps the effect's own name", () => {
    expect(game.preview(start, [{ effect: 'spend', amount: 4 }], sim)).toEqual([
      { effect: 'spend', after: 6, allowed: true },
    ]);
    expect(game.preview(start, [{ effect: 'spend', amount: 40 }], sim)).toEqual([
      { effect: 'spend', after: -30, allowed: false },
    ]);
  });

  it('changes nothing: the state and its streams stay as they were', () => {
    const before = JSON.stringify(start);
    const previews = game.preview(start, [{ effect: 'spend', amount: 4 }], sim);
    expect(JSON.stringify(start)).toBe(before);
    expect(Object.isFrozen(previews)).toBe(true);
    expect(Object.isFrozen(previews[0])).toBe(true);
  });

  it('throws on an unknown effect, a preview that never stops, and one that is not JSON', () => {
    expect(() => game.preview(start, [{ effect: 'teleport' }], sim)).toThrow('Unknown effect "teleport"');
    expect(() => game.preview(start, [{ effect: 'echo' }], sim)).toThrow('Effects nested 64 deep');
    expect(() => game.preview(start, [{ effect: 'odd' }], sim)).toThrow('NaN has no JSON form');
  });
});
