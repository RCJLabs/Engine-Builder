import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';

interface Crew {
  sector: number;
  won: number;
  dead: number;
}

type Read = (id: string, args?: Record<string, unknown>) => unknown;

// Six jumps make a run, as Space-Wrecked's first act does, and a run that drags is called home.
const SECTORS = 6;
const LAST_DAY = 60;
// Fitting a berth costs 40 credits; the ship has room for six.
const BERTH = 40;
const MOST_BERTHS = 6;
// A wound past three stacks kills.
const MOST_WOUNDS = 3;
const HALLS = ['outpost', 'relay'];

/** The crew now: every actor the roster has on it, written or made in play. */
const crewOf = (ids: readonly string[], fact: Read) => ids.filter((actor) => fact('roster.member', { actor }) === true);

/** Hits a fight needs: one, and one more every second sector. */
const needed = (sector: number) => 1 + Math.floor(sector / 2);

function wound(ctx: ModuleContext<Crew>, actor: string): void {
  if ((ctx.fact('stats.has', { actor, status: 'wounded' }) as number) < MOST_WOUNDS) {
    ctx.apply({ effect: 'add-status', actor, status: 'wounded' });
    return;
  }
  ctx.apply({ effect: 'leave', actor, why: 'dead' });
  ctx.write().dead += 1;
}

/** Ends the run when the captain is lost, the last sector is crossed or the days run out. */
function ended(ctx: ModuleContext<Crew>): boolean {
  if (ctx.fact('roster.member', { actor: 'captain' }) !== true) {
    ctx.modes.replace('lost');
    ctx.emit('lost', {});
    return true;
  }
  if (ctx.read().sector >= SECTORS || (ctx.fact('time.day') as number) >= LAST_DAY) {
    ctx.modes.replace('home');
    ctx.emit('home', {});
    return true;
  }
  return false;
}

/**
 * Space-Wrecked's crew, cut down: a captain sails six sectors, hiring at stations, fighting what
 * each sector holds, and fitting berths for more hands. Every member fires once a fight; enough
 * hits win it, and a miss wounds. The crew's numbers, ranks and bonds are the kits'.
 */
export const crew: Module = defineModule<Crew>({
  id: 'crew',
  init: () => ({ sector: 0, won: 0, dead: 0 }),
  actions: {
    fight(ctx) {
      const fact: Read = (id, args) => ctx.fact(id, args);
      const rng = ctx.rng('fights');
      let hits = 0;
      for (const actor of crewOf(ctx.content.ids('actor'), fact)) {
        ctx.apply({ effect: 'add-to-stat', actor, stat: 'fights', by: 1 });
        if (rng.int(1, 100) <= (fact('stats.value', { actor, stat: 'aim' }) as number)) hits += 1;
        else wound(ctx, actor);
      }
      ctx.apply({ effect: 'wait', days: 1 });
      if (hits >= needed(ctx.read().sector)) {
        ctx.write().won += 1;
        ctx.emit('won', {});
      } else ctx.emit('beaten', {});
      ended(ctx);
    },
    rest(ctx) {
      ctx.apply({ effect: 'wait', days: 1 });
      ended(ctx);
    },
    dock: {
      run(ctx, action) {
        ctx.apply({ effect: 'wait', days: 1 });
        if (!ended(ctx)) ctx.apply({ effect: 'open-hall', hall: action.hall });
      },
      options: () => HALLS.map((hall) => ({ hall })),
    },
    // A new sector: two days out, and new faces at every station.
    jump(ctx) {
      ctx.apply({ effect: 'wait', days: 2 });
      ctx.write().sector += 1;
      for (const hall of HALLS) ctx.apply({ effect: 'refresh-hall', hall });
      ctx.emit('jumped', { sector: ctx.read().sector });
      ended(ctx);
    },
    // The berth itself is the sheet's: a row on crew/fitted raises the roster's cap.
    fit: {
      run(ctx) {
        ctx.apply({ effect: 'pay-cost', cost: { credits: BERTH } });
        ctx.emit('fitted', {});
      },
      options: ({ fact }) =>
        (fact('economy.amount', { resource: 'credits' }) as number) >= BERTH &&
        (fact('flag.number', { flag: 'berths' }) as number) < MOST_BERTHS
          ? [{}]
          : [],
    },
  },
  facts: {
    sector: { read: ({ state }) => state.sector, domain: { type: 'int', min: 0 }, label: 'the sector' },
    won: { read: ({ state }) => state.won, domain: { type: 'int', min: 0 }, label: 'fights won' },
    dead: { read: ({ state }) => state.dead, domain: { type: 'int', min: 0 }, label: 'the dead' },
  },
  events: {
    won: { args: {}, label: 'A fight is won' },
    beaten: { args: {}, label: 'A fight is lost' },
    jumped: { args: { sector: { type: 'int', min: 1 } }, label: 'The ship jumps' },
    fitted: { args: {}, label: 'A berth is fitted' },
    lost: { args: {}, label: 'The captain is lost' },
    home: { args: {}, label: 'The run is over' },
  },
  modes: { crew: { actions: ['crew/*'] }, lost: { actions: [] }, home: { actions: [] } },
});
