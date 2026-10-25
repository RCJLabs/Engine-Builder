// The moor's one mode: walked, and a rest, so there is always something on offer.
import type { Module } from 'eb';
import { defineModule } from 'eb';

export const moor: Module = defineModule<Record<string, never>>({
  id: 'moor',
  init: () => ({}),
  actions: {
    rest: { run: () => {}, options: () => [{}] },
  },
  modes: { out: { actions: ['world/*', 'moor/rest'] } },
});
