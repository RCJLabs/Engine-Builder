// The trail (M5.8's gate, D70): a trailhead walked in third person up to a cairn, and a bothy walked
// in first person. Walking is the stage's and the cairn's zone is data; going in and out is this game's.
import type { Module } from 'eb';
import { defineModule } from 'eb';

export const trail: Module = defineModule<Record<string, never>>({
  id: 'trail',
  init: () => ({}),
  actions: {
    'go-in': {
      run(ctx) {
        ctx.modes.replace('bothy');
      },
      options: () => [{}],
    },
    'go-out': {
      run(ctx) {
        ctx.modes.replace('trailhead');
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
