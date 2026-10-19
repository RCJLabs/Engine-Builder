import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';

interface School {
  bookings: number;
}

// A season at the school: forty days, and then the games close for the winter.
const SEASON = 40;
// Out of a hundred drills, the ones that kill.
const DRILL_DEATHS = 4;

/** The gladiators now: every actor on the roster, written or bought. */
const gladiators = (ctx: ModuleContext<School>) =>
  ctx.content.ids('actor').filter((actor) => ctx.fact('roster.member', { actor }) === true);

function ended(ctx: ModuleContext<School>): boolean {
  if ((ctx.fact('time.day') as number) < SEASON) return false;
  ctx.modes.replace('winter');
  ctx.emit('winter', {});
  return true;
}

/**
 * Ludus's school, cut down: a lanista trains the gladiators, buys more at the market, and takes
 * bookings at the games. Who is booked, the rival's challenge and how the bouts go are quests'.
 */
export const school: Module = defineModule<School>({
  id: 'school',
  init: () => ({ bookings: 0 }),
  actions: {
    // A day's drill: one gladiator, drawn from the school's own stream, gains a point of fame, or
    // now and then dies of it, so a booked man can be gone before the games.
    train(ctx) {
      const crew = gladiators(ctx);
      if (crew.length > 0) {
        const drill = ctx.rng('drill');
        const actor = crew[drill.int(0, crew.length - 1)] as string;
        if (drill.int(1, 100) <= DRILL_DEATHS) ctx.apply({ effect: 'leave', actor, why: 'dead' });
        else ctx.apply({ effect: 'add-to-stat', actor, stat: 'fame', by: 1 });
      }
      ctx.apply({ effect: 'wait', days: 1 });
      ended(ctx);
    },
    rest(ctx) {
      ctx.apply({ effect: 'wait', days: 1 });
      ended(ctx);
    },
    market(ctx) {
      ctx.apply({ effect: 'wait', days: 1 });
      if (!ended(ctx)) ctx.apply({ effect: 'open-hall', hall: 'market' });
    },
    // The lanista asks the editor of the games for a booking; the sheet takes it, and the quest
    // picks who is booked.
    book: {
      run(ctx) {
        ctx.write().bookings += 1;
        ctx.emit('asked', {});
      },
      options: ({ fact }) =>
        fact('quests.state', { quest: 'booking' }) !== 'active' && (fact('roster.count') as number) > 0 ? [{}] : [],
    },
  },
  facts: {
    bookings: { read: ({ state }) => state.bookings, domain: { type: 'int', min: 0 }, label: 'bookings taken' },
  },
  events: {
    asked: { args: {}, label: 'A booking is asked for' },
    winter: { args: {}, label: 'The season is over' },
  },
  modes: { school: { actions: ['school/*'] }, winter: { actions: [] } },
});
