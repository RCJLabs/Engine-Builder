// The camp's one mode: walked, with the clock running, the bandits sensing and the fights on; and the
// hero's change of weapon, offered while the other is in the bag.
import type { Module } from 'eb';
import { defineModule } from 'eb';

const wielding = (view: { fact(id: string, args?: Record<string, unknown>): unknown }) =>
  view.fact('gear.in-slot', { actor: 'hero', slot: 'hand' });

export const camp: Module = defineModule<Record<string, never>>({
  id: 'camp',
  init: () => ({}),
  start: (ctx) => {
    ctx.apply({ effect: 'give-item', item: 'bow' });
    ctx.apply({ effect: 'give-item', item: 'arrow', count: 10 });
  },
  actions: {
    bow: {
      run: (ctx) => ctx.apply({ effect: 'equip', actor: 'hero', item: 'bow' }),
      options: (view) => (wielding(view) === 'sword' ? [{}] : []),
    },
    sword: {
      run: (ctx) => ctx.apply({ effect: 'equip', actor: 'hero', item: 'sword' }),
      options: (view) => (wielding(view) === 'bow' ? [{}] : []),
    },
  },
  modes: { out: { actions: ['world/*', 'time/*', 'ai/*', 'fighting/*', 'camp/*'] } },
});
