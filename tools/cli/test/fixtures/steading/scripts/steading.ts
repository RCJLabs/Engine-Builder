import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';

interface Steading {
  raids: number;
}

type Read = (id: string, args?: Record<string, unknown>) => unknown;

// A year on the coast, from the first day of summer to the last of spring.
const YEAR = 96;
// Ten days gone hungry, and the household scatters.
const STARVED = 10;
// Landnam's moves: a raid costs 45 standing, tribute of 10 hacksilver buys 22.
const RAID = -45;
// A steading raids when its stores run low, not for sport.
const LOW = 5;
const TRIBUTE = 22;
const SILVER = 10;

const NEIGHBOURS = ['grimsgarth', 'ketilstead', 'reed-camp', 'sealwatch'];
const HALLS = ['grimsgarth', 'ketilstead'];
const SHOP: Readonly<Record<string, string>> = {
  grimsgarth: 'grimsgarth-hall',
  ketilstead: 'ketilstead-hall',
  'reed-camp': 'reed-camp-fire',
  sealwatch: 'sealwatch-shore',
};

const band = (fact: Read, faction: string) => fact('factions.band', { faction }) as string;
const each = () => NEIGHBOURS.map((neighbour) => ({ neighbour }));

/** Ends the year once its last day comes, or sooner when the household starves. */
function ended(ctx: ModuleContext<Steading>): boolean {
  if ((ctx.fact('flag.number', { flag: 'hunger' }) as number) >= STARVED) {
    ctx.modes.replace('scattered');
    ctx.emit('scattered', {});
    return true;
  }
  if ((ctx.fact('time.day') as number) >= YEAR) {
    ctx.modes.replace('wintered');
    ctx.emit('wintered', {});
    return true;
  }
  return false;
}

/**
 * Landnam's coast, cut down: a steading among four neighbours trades, raids and pays tribute
 * through a year of 24-day seasons, while the standing it moves drifts back toward indifference.
 */
export const steading: Module = defineModule<Steading>({
  id: 'steading',
  init: () => ({ raids: 0 }),
  actions: {
    trade: {
      // No barter with a neighbour that is hostile, as Landnam has it below -35.
      run(ctx, action) {
        const neighbour = action.neighbour as string;
        if (band((id, args) => ctx.fact(id, args), neighbour) === 'hostile') return ctx.refuse('hostile');
        ctx.apply({ effect: 'wait', days: 1 });
        if (!ended(ctx)) ctx.apply({ effect: 'open-shop', shop: SHOP[neighbour] });
      },
      options: ({ fact }) => each().filter(({ neighbour }) => band(fact, neighbour) !== 'hostile'),
    },
    raid: {
      run(ctx, action) {
        const neighbour = action.neighbour as string;
        ctx.apply({ effect: 'wait', days: 1 });
        ctx.apply({ effect: 'roll-loot', table: HALLS.includes(neighbour) ? 'hall-plunder' : 'camp-plunder' });
        ctx.apply({ effect: 'change-standing', faction: neighbour, by: RAID });
        ctx.write().raids += 1;
        ctx.emit('raided', { neighbour });
        ended(ctx);
      },
      options: ({ fact }) => ((fact('inventory.count', { item: 'fish' }) as number) < LOW ? each() : []),
    },
    tribute: {
      run(ctx, action) {
        ctx.apply({ effect: 'pay-cost', cost: { hacksilver: SILVER } });
        ctx.apply({ effect: 'change-standing', faction: action.neighbour, by: TRIBUTE });
      },
      options: ({ fact }) => ((fact('economy.amount', { resource: 'hacksilver' }) as number) >= SILVER ? each() : []),
    },
    rest(ctx) {
      ctx.apply({ effect: 'wait', days: 1 });
      ended(ctx);
    },
  },
  facts: {
    raids: { read: ({ state }) => state.raids, domain: { type: 'int', min: 0 }, label: 'raids made' },
  },
  events: {
    raided: { args: { neighbour: { type: 'ref', to: 'faction' } }, label: 'The steading raids a neighbour' },
    scattered: { args: {}, label: 'The household scatters' },
    wintered: { args: {}, label: 'The year is out' },
  },
  modes: { steading: { actions: ['steading/*'] }, scattered: { actions: [] }, wintered: { actions: [] } },
});
