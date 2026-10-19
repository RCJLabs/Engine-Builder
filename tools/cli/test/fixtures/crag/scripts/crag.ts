import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';

interface Trip {
  day: number;
  climbs: number;
}

// Twelve days make a trip, a long weekend twice over and then some, as Dirtbag's road trips run.
const LAST_DAY = 12;
// A shift at the gym in town pays 15.
const WAGE = 15;

/** A day passes; on the last, the trip is over and true is returned. */
function dayPasses(ctx: ModuleContext<Trip>): boolean {
  ctx.write().day += 1;
  if (ctx.read().day < LAST_DAY) return false;
  ctx.modes.replace('home');
  ctx.emit('home', {});
  return true;
}

/**
 * Dirtbag's crag, cut down: a day's work in town for cash, or a day's drive out to the crag, where
 * the sheet has the ranger check permits at the gate and Marge talk in the lot; with a permit, a
 * day climbing. Who says what, what it costs and what it does are the talks'.
 */
export const crag: Module = defineModule<Trip>({
  id: 'crag',
  init: () => ({ day: 0, climbs: 0 }),
  actions: {
    work(ctx) {
      ctx.apply({ effect: 'add-resource', resource: 'cash', by: WAGE });
      dayPasses(ctx);
    },
    drive(ctx) {
      if (dayPasses(ctx)) return;
      ctx.modes.replace('crag');
      ctx.emit('arrived', {});
    },
    climb: {
      run(ctx) {
        ctx.write().climbs += 1;
        ctx.emit('climbed', {});
        dayPasses(ctx);
      },
      options: ({ fact }) => (fact('flag.on', { flag: 'permit' }) === true ? [{}] : []),
    },
    leave(ctx) {
      ctx.modes.replace('town');
    },
  },
  facts: {
    day: { read: ({ state }) => state.day, domain: { type: 'int', min: 0 }, label: 'the day' },
    climbs: { read: ({ state }) => state.climbs, domain: { type: 'int', min: 0 }, label: 'days climbing' },
  },
  events: {
    arrived: { args: {}, label: 'The party reaches the crag' },
    climbed: { args: {}, label: 'A day’s climbing is done' },
    home: { args: {}, label: 'The trip is over' },
  },
  modes: {
    town: { actions: ['crag/work', 'crag/drive'] },
    crag: { actions: ['crag/climb', 'crag/leave'] },
    home: { actions: [] },
  },
});
