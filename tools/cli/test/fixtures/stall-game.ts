/**
 * A --game module for a project that lists kits (M3.3): a stall that hands out rope three times.
 * It names no kit, so `eb sim` joins the inventory kit the stall's project.json lists, as it joins
 * a project's own game's.
 */
import { defineModule } from '@eb/core';

const stall = defineModule<{ given: number }>({
  id: 'stall',
  init: () => ({ given: 0 }),
  actions: {
    give: {
      run: (ctx) => {
        ctx.apply({ effect: 'give-item', item: 'rope' });
        ctx.write().given = ctx.read().given + 1;
        if (ctx.read().given >= 3) ctx.modes.replace('shut');
      },
      options: () => [{}],
    },
  },
  modes: { open: { actions: ['stall/give'] }, shut: { actions: [] } },
});

export const recordTypes = [];
export const modules = [stall];
export const start = 'open';
export const metrics = [{ fact: 'inventory.count', args: { item: 'rope' }, label: 'rope' }];
