// The square's one mode: walked, and a rest, so there is always something on offer and the game goes on.
import type { Module } from 'eb';
import { defineModule } from 'eb';

export const square: Module = defineModule<Record<string, never>>({
  id: 'square',
  init: () => ({}),
  actions: {
    rest: { run: () => {}, options: () => [{}] },
  },
  modes: { out: { actions: ['world/*', 'square/rest'] } },
});
