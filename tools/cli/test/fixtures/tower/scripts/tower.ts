// The tower's one mode: shown, with the clock running and the folk on their rounds, and a Wait that
// moves the clock an hour, so there is always something on offer.
import type { Module } from 'eb';
import { defineModule } from 'eb';

export const tower: Module = defineModule<Record<string, never>>({
  id: 'tower',
  init: () => ({}),
  actions: {
    wait: { run: (ctx) => ctx.apply({ effect: 'wait', hours: 1 }), options: () => [{}] },
  },
  modes: { night: { actions: ['world/*', 'time/*', 'ai/*', 'tower/wait'] } },
});
