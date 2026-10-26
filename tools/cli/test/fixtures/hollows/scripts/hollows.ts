// The hollows' one mode: walked, and a rest, so there is always something on offer and the game goes on.
import type { Module } from 'eb';
import { defineModule } from 'eb';

export const hollows: Module = defineModule<Record<string, never>>({
  id: 'hollows',
  init: () => ({}),
  actions: {
    rest: { run: () => {}, options: () => [{}] },
  },
  modes: { out: { actions: ['world/*', 'hollows/rest'] } },
});
