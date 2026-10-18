import type { Module } from 'eb';
import { defineModule } from 'eb';

interface Hold {
  count: number;
  trips: number;
}

/** A hold to fill: loot until it is full, or the crew has sailed five times, then go home. */
export const hold: Module = defineModule<Hold>({
  id: 'hold',
  init: () => ({ count: 0, trips: 0 }),
  actions: {
    loot(ctx) {
      const found = ctx.rng('loot').int(1, 3);
      const count = Math.min(10, ctx.read().count + found);
      ctx.write().count = count;
      ctx.emit('looted', { count });
    },
    sail(ctx) {
      const trips = ctx.read().trips + 1;
      ctx.write().trips = trips;
      if (ctx.read().count >= 10 || trips >= 5) ctx.modes.replace('home');
    },
  },
  events: { looted: { args: { count: { type: 'int', min: 0, max: 10 } }, label: 'The crew loots' } },
  facts: {
    count: { read: ({ state }) => state.count, domain: { type: 'int', min: 0, max: 10 }, label: 'crates held' },
  },
  effects: {
    stash(ctx) {
      ctx.write().count = Math.min(10, ctx.read().count + 1);
    },
  },
  modes: { sea: { actions: ['hold/*'] }, home: { actions: [] } },
});
