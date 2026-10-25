// The village's one mode: walked, with the clock running and the NPCs sensing, and a Wait that jumps
// the clock twelve hours, so there is always something on offer.
import type { Module } from 'eb';
import { defineModule } from 'eb';

export const village: Module = defineModule<Record<string, never>>({
  id: 'village',
  init: () => ({}),
  actions: {
    wait: { run: (ctx) => ctx.apply({ effect: 'wait', hours: 12 }), options: () => [{}] },
  },
  modes: { out: { actions: ['world/*', 'time/*', 'ai/*', 'village/*'] } },
});
