/**
 * A --game module for a project whose calendar matters (M3.5): an almanac that rests a day at a
 * time for 16 days, with the engine's flags and sheets. It names no kit, so `eb sim` joins the time
 * kit project.json lists, with the calendar there: two years of 8 days, the wet season starting on
 * each one's fifth day, which the sheet's row counts.
 */
import { defineModule, flagModule, logicModule, sheetModule } from '@eb/core';

const almanac = defineModule<{ rested: number }>({
  id: 'almanac',
  init: () => ({ rested: 0 }),
  actions: {
    rest: {
      run: (ctx) => {
        ctx.apply({ effect: 'wait', days: 1 });
        ctx.write().rested = ctx.read().rested + 1;
        if (ctx.read().rested >= 16) ctx.modes.replace('done');
      },
      options: () => [{}],
    },
  },
  modes: { resting: { actions: ['almanac/rest'] }, done: { actions: [] } },
});

export const recordTypes = [];
export const modules = [logicModule, flagModule, sheetModule, almanac];
export const start = 'resting';
export const metrics = [{ fact: 'flag.number', args: { flag: 'rains' }, label: 'rains' }];
