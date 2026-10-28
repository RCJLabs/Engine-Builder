// The deck's one mode: a shift aboard, the clock running and the crew walking their rounds, and a
// Wait that moves the clock an hour, so there is always something on offer.
import type { Module } from 'eb';
import { defineModule } from 'eb';

export const deck: Module = defineModule<Record<string, never>>({
  id: 'deck',
  init: () => ({}),
  actions: {
    wait: { run: (ctx) => ctx.apply({ effect: 'wait', hours: 1 }), options: () => [{}] },
  },
  modes: { shift: { actions: ['world/*', 'time/*', 'ai/*', 'deck/wait'] } },
});
