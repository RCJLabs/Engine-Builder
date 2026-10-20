import type { Module } from 'eb';
import { defineModule } from 'eb';

/** A week in the valley, as Dirtbag's season is counted in days. */
const DAYS = 7;

/**
 * The van, cut down from Dirtbag: it starts at home on the valley's map and drives by its roads,
 * each drive the quickest, paying in hours and cash. A week on, the trip is over.
 */
export const valley: Module = defineModule<Record<string, never>>({
  id: 'valley',
  init: () => ({}),
  start: (ctx) => ctx.apply({ effect: 'enter-map', map: 'valley' }),
  on: {
    'time/day-started': (ctx, event) => {
      if ((event.day as number) >= DAYS) ctx.modes.replace('home');
    },
  },
  modes: { driving: { actions: ['maps/*'] }, home: { actions: [] } },
});
