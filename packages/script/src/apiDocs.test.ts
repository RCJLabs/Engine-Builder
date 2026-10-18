import { createGame, createRecordStore, defineModule, type ModuleContext } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { EB_MODULE } from './api.ts';
import { CTX_API, EB_API, RNG_API } from './apiDocs.ts';

describe('the API completion offers', () => {
  it('names what "eb" gives, in its order, functions as functions', () => {
    expect(EB_API.map((entry) => entry.name)).toEqual(Object.keys(EB_MODULE));
    for (const entry of EB_API) {
      expect(entry.kind === 'function', entry.name).toBe(typeof EB_MODULE[entry.name] === 'function');
    }
  });

  it("names what a handler's ctx and an rng stream have", () => {
    let seen: ModuleContext<unknown> | undefined;
    const probe = defineModule({
      id: 'probe',
      init: () => ({}),
      actions: {
        look: (ctx) => {
          seen = ctx;
        },
      },
      modes: { play: { actions: ['probe/*'] } },
    });
    const game = createGame({ modules: [probe], start: 'play' });
    const sim = { content: createRecordStore({}) };
    game.reduce(game.init('seed', sim), { type: 'probe/look' }, sim);
    const ctx = seen as ModuleContext<unknown>;
    for (const entry of CTX_API) {
      expect(entry.name in ctx, entry.name).toBe(true);
      expect(entry.kind === 'function', entry.name).toBe(typeof ctx[entry.name as keyof typeof ctx] === 'function');
    }
    const rng = ctx.rng('probe');
    for (const entry of RNG_API) expect(typeof rng[entry.name as keyof typeof rng], entry.name).toBe('function');
  });
});
