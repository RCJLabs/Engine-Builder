import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';

type Read = (id: string, args?: Record<string, unknown>) => unknown;

// A season at the hut is ten days, from the first snow melting off the path to the next.
const LAST_DAY = 10;

const open = (fact: Read) => (fact('time.day') as number) < LAST_DAY;

/** A day ends: the time kit starts the next, which the sheet hears. */
function dayEnds(ctx: ModuleContext<Record<string, never>>): void {
  ctx.apply({ effect: 'wait', days: 1 });
}

/**
 * The hut through a season: a day carrying a load up from the village, or a day's rest; the
 * store; a visit to Greta or Anselm, whose talks the sheet opens. Who says what, what it costs and
 * what the quests ask are records. On the last day the hut closes.
 */
export const hut: Module = defineModule<Record<string, never>>({
  id: 'hut',
  init: () => ({}),
  actions: {
    carry: {
      run(ctx) {
        ctx.emit('carried', {});
        dayEnds(ctx);
      },
      options: ({ fact }) => (open(fact) ? [{}] : []),
    },
    rest: {
      run(ctx) {
        dayEnds(ctx);
      },
      options: ({ fact }) => (open(fact) ? [{}] : []),
    },
    store: {
      run(ctx) {
        ctx.apply({ effect: 'open-shop', shop: 'store' });
      },
      options: ({ fact }) => (open(fact) ? [{}] : []),
    },
    visit: {
      run(ctx, action) {
        ctx.emit('visited', { who: action.who });
      },
      options: ({ fact }) => (open(fact) ? [{ who: 'greta' }, { who: 'anselm' }] : []),
    },
    close: {
      run(ctx) {
        ctx.modes.replace('closed');
        ctx.emit('closed', {});
      },
      options: ({ fact }) => (open(fact) ? [] : [{}]),
    },
  },
  events: {
    carried: { args: {}, label: 'A load is carried up' },
    visited: { args: { who: { type: 'enum', values: ['greta', 'anselm'] } }, label: 'Someone is visited' },
    closed: { args: {}, label: 'The hut closes for the winter' },
  },
  modes: { hut: { actions: ['hut/*'] }, closed: { actions: [] } },
});
