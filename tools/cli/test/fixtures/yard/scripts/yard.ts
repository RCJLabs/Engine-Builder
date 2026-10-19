import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';

type Read = (id: string, args?: Record<string, unknown>) => unknown;

// Twelve days in the yard, as Space-Wrecked's first act runs about two weeks.
const LAST_DAY = 12;
// One haul in two is a rogue drone's wreck, which pays less than scrap but counts for the bounty.
const DRONE_ODDS = 2;

const day = (fact: Read) => fact('time.day') as number;

/** The day ends: the time kit raises its start, then the morning comes, when the sheet has the miner call. */
function nextDay(ctx: ModuleContext<Record<string, never>>): void {
  ctx.apply({ effect: 'wait', days: 1 });
  ctx.emit('dawn', {});
}

/**
 * Space-Wrecked's salvage yard, cut down: a day's salvage, scrap or a drone's wreck, or a day's
 * rest, until the twelfth day, when the crew moves on. The debt, the bounty, the name to be made
 * and the chief's trust are quests; the miner's call is an event the sheet opens.
 */
export const yard: Module = defineModule<Record<string, never>>({
  id: 'yard',
  init: () => ({}),
  actions: {
    salvage: {
      run(ctx) {
        const drone = ctx.rng('haul').int(1, DRONE_ODDS) === 1;
        ctx.apply({ effect: 'add-resource', resource: 'credits', by: drone ? 5 : 10 });
        ctx.emit('salvaged', { kind: drone ? 'drone' : 'scrap' });
        nextDay(ctx);
      },
      options: ({ fact }) => (day(fact) < LAST_DAY ? [{}] : []),
    },
    rest: {
      run(ctx) {
        nextDay(ctx);
      },
      options: ({ fact }) => (day(fact) < LAST_DAY ? [{}] : []),
    },
    leave: {
      run(ctx) {
        ctx.modes.replace('gone');
        ctx.emit('gone', {});
      },
      options: ({ fact }) => (day(fact) >= LAST_DAY ? [{}] : []),
    },
  },
  events: {
    salvaged: { args: { kind: { type: 'enum', values: ['scrap', 'drone'] } }, label: 'A haul is salvaged' },
    dawn: { args: {}, label: 'A morning in the yard' },
    gone: { args: {}, label: 'The crew moves on' },
  },
  modes: { yard: { actions: ['yard/*'] }, gone: { actions: [] } },
});
