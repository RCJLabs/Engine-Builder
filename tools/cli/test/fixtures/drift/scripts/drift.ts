import type { Module } from 'eb';
import { defineModule } from 'eb';

/** Sectors in a run, as Space-Wrecked's act 2 crosses five: the sheet enters each but the last. */
const SECTORS = 3;

/**
 * The ship, cut down from Space-Wrecked's act 2: it enters the first sector as the game starts and
 * flies by the maps kit's moves alone. At the last sector's jump point the run is over. A ship out
 * of supplies can't jump, and drifts: the run ends there too.
 */
export const drift: Module = defineModule<Record<string, never>>({
  id: 'drift',
  init: () => ({}),
  start: (ctx) => ctx.apply({ effect: 'enter-map', map: 'sector' }),
  on: {
    'maps/arrived': (ctx) => {
      if (ctx.fact('maps.at-end') === true && (ctx.fact('maps.entered') as number) >= SECTORS)
        ctx.modes.replace('home');
    },
  },
  modes: { flying: { actions: ['maps/*'] }, home: { actions: [] } },
});
