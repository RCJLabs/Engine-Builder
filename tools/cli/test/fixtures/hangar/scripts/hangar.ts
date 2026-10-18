import type { Module } from 'eb';
import { defineModule } from 'eb';

interface Hangar {
  ending: 'launched' | 'stranded' | null;
}

type Read = (id: string, args?: Record<string, unknown>) => unknown;

// What a ship needs to launch: power, an engine and life support.
const NEEDS = ['reactor', 'engine', 'lifesupport'];
// The rent comes due: a crew still on the ground then stays there.
const LAST_DAY = 60;

const ready = (fact: Read) => NEEDS.every((item) => (fact('inventory.count', { item }) as number) >= 1);

/**
 * Space-Wrecked's hangar (act 1), as a game of its own: work the job board for credits and parts,
 * shop at Dutch's yard, and launch once the ship has what it needs, or be stranded at day 60.
 */
export const hangar: Module = defineModule<Hangar>({
  id: 'hangar',
  init: () => ({ ending: null }),
  actions: {
    work: {
      run(ctx, action) {
        const job = ctx.content.getOrThrow<{ pays: string; drops?: string }>('job', action.job as string);
        ctx.apply({ effect: 'wait', days: 1 });
        ctx.apply({ effect: 'roll-loot', table: job.pays });
        if (job.drops) ctx.apply({ effect: 'roll-loot', table: job.drops });
        if ((ctx.fact('time.day') as number) >= LAST_DAY && !ready((id, args) => ctx.fact(id, args))) {
          ctx.write().ending = 'stranded';
          ctx.modes.replace('stranded');
          ctx.emit('ended', { ending: 'stranded' });
        }
      },
      options: ({ content }) => content.ids('job').map((job) => ({ job })),
    },
    shop: (ctx) => ctx.apply({ effect: 'open-shop', shop: 'dutch-yard' }),
    launch: {
      run(ctx) {
        if (!ready((id, args) => ctx.fact(id, args))) return ctx.refuse('not-ready');
        ctx.write().ending = 'launched';
        ctx.modes.replace('launched');
        ctx.emit('ended', { ending: 'launched' });
      },
      options: ({ fact }) => (ready(fact) ? [{}] : []),
    },
  },
  facts: {
    ending: {
      read: ({ state }) => state.ending ?? undefined,
      domain: { type: 'enum', values: ['launched', 'stranded'] },
    },
  },
  events: {
    ended: {
      args: { ending: { type: 'enum', values: ['launched', 'stranded'] } },
      label: 'The crew leaves the hangar',
    },
  },
  modes: { hangar: { actions: ['hangar/*'] }, launched: { actions: [] }, stranded: { actions: [] } },
});
