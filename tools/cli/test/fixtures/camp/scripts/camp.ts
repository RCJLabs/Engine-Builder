// The camp's one mode: walked, with the clock running, the bandits sensing and the fights on; and the
// hero's change of weapon, offered while the other is in the bag: not once it is put in a body (M6.9's
// bots found that).
import type { Module } from 'eb';
import { defineModule } from 'eb';

type View = { fact(id: string, args?: Record<string, unknown>): unknown };
const wielding = (view: View) => view.fact('gear.in-slot', { actor: 'hero', slot: 'hand' });
const bagged = (view: View, item: string) => Number(view.fact('inventory.count', { item })) > 0;

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
      options: (view) => (wielding(view) === 'sword' && bagged(view, 'bow') ? [{}] : []),
    },
    sword: {
      run: (ctx) => ctx.apply({ effect: 'equip', actor: 'hero', item: 'sword' }),
      options: (view) => (wielding(view) === 'bow' && bagged(view, 'sword') ? [{}] : []),
    },
  },
  modes: { out: { actions: ['world/*', 'time/*', 'ai/*', 'fighting/*', 'camp/*'] } },
});
