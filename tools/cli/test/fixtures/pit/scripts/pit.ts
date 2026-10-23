import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';

interface Pit {
  day: number;
}

// Twelve days of games, then the season is over.
const SEASON = 12;
// What a night in the yard gives back.
const MENDS = 3;

/** The gladiators now: every actor on the roster. */
const gladiators = (ctx: ModuleContext<Pit>) =>
  ctx.content.ids('actor').filter((actor) => ctx.fact('roster.member', { actor }) === true);

/** A night's rest: vigour back a little, and an injury gone once a man is whole again. */
function rest(ctx: ModuleContext<Pit>, actor: string): void {
  ctx.apply({ effect: 'heal-stat', actor, stat: 'vigour', by: MENDS });
  const whole =
    ctx.fact('stats.current', { actor, stat: 'vigour' }) === ctx.fact('stats.value', { actor, stat: 'vigour' });
  if (whole && (ctx.fact('stats.has', { actor, status: 'injured' }) as number) > 0) {
    ctx.apply({ effect: 'remove-status', actor, status: 'injured' });
  }
}

/**
 * Ludus's pit, cut down: each day the yard rests, then the editor of the games offers a bout drawn
 * from the deck, which the lanista takes or turns down. The bouts are the encounters kit's, worked
 * out round by round; who is in the ludus is the roster's.
 */
export const pit: Module = defineModule<Pit>({
  id: 'pit',
  init: () => ({ day: 0 }),
  actions: {
    day(ctx) {
      ctx.write().day += 1;
      for (const actor of gladiators(ctx)) rest(ctx, actor);
      if (ctx.read().day > SEASON || gladiators(ctx).length === 0) {
        ctx.modes.replace('over');
        return;
      }
      ctx.apply({ effect: 'draw-event', deck: 'games' });
    },
  },
  facts: {
    day: { read: ({ state }) => state.day, domain: { type: 'int', min: 0 }, label: 'the day' },
  },
  modes: { yard: { actions: ['pit/day'] }, over: { actions: [] } },
});
