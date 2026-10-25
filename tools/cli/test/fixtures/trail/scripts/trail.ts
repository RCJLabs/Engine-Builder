// The trail (M5.8's gate, D70): a trailhead walked in third person up to a cairn, and a bothy walked
// in first person. Walking is the stage's and the cairn's zone is data; going in and out is this game's,
// and moves the player to the other space (M5.9), so where they stand is kept in each.
import type { Module } from 'eb';
import { defineModule } from 'eb';

export const trail: Module = defineModule<Record<string, never>>({
  id: 'trail',
  init: () => ({}),
  actions: {
    'go-in': {
      run(ctx) {
        ctx.modes.replace('bothy');
        ctx.apply({ effect: 'enter-space', space: 'bothy', spawn: 'door' });
      },
      options: () => [{}],
    },
    'go-out': {
      run(ctx) {
        ctx.modes.replace('trailhead');
        ctx.apply({ effect: 'enter-space', space: 'trailhead' });
      },
      options: () => [{}],
    },
  },
  // Walking counts in both: each space's zones are its own.
  modes: {
    trailhead: { actions: ['world/*', 'trail/go-in'] },
    bothy: { actions: ['world/*', 'trail/go-out'] },
  },
});
