import type { Module } from 'eb';
import { defineModule } from 'eb';

type Read = (id: string, args?: Record<string, unknown>) => unknown;

// Eight nodes make a run, as Wasteland's does; the sheet counts them and draws what each holds.
const NODES = 8;

const nodes = (fact: Read) => fact('flag.number', { flag: 'nodes' }) as number;
const fuel = (fact: Read) => fact('economy.amount', { resource: 'fuel' }) as number;
const owed = (fact: Read) => fact('events.booked') as number;

/**
 * Wasteland's convoy, cut down: it drives node to node on a unit of fuel and a day each, or loses
 * a day scavenging for fuel. Past the last node it camps until every consequence it booked has
 * landed, as Wasteland's fix says no term outlives a run, and then it is home.
 */
export const convoy: Module = defineModule<Record<string, never>>({
  id: 'convoy',
  init: () => ({}),
  actions: {
    travel: {
      run(ctx) {
        ctx.apply({ effect: 'add-resource', resource: 'fuel', by: -1 });
        ctx.apply({ effect: 'wait', days: 1 });
        ctx.emit('traveled', {});
      },
      options: ({ fact }) => (nodes(fact) < NODES && fuel(fact) >= 1 ? [{}] : []),
    },
    scavenge: {
      run(ctx) {
        ctx.apply({ effect: 'wait', days: 1 });
        ctx.apply({ effect: 'add-resource', resource: 'fuel', by: 1 });
      },
      options: ({ fact }) => (nodes(fact) < NODES ? [{}] : []),
    },
    camp: {
      run(ctx) {
        ctx.apply({ effect: 'wait', days: 1 });
      },
      options: ({ fact }) => (nodes(fact) >= NODES && owed(fact) > 0 ? [{}] : []),
    },
    arrive: {
      run(ctx) {
        ctx.modes.replace('home');
        ctx.emit('home', {});
      },
      options: ({ fact }) => (nodes(fact) >= NODES && owed(fact) === 0 ? [{}] : []),
    },
  },
  events: {
    traveled: { args: {}, label: 'The convoy reaches a node' },
    home: { args: {}, label: 'The convoy is home' },
  },
  modes: { convoy: { actions: ['convoy/*'] }, home: { actions: [] } },
});
