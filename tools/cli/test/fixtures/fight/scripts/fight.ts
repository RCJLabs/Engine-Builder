// The watch aboard before the boarders come: the alarm's use, once, starts the battle, and after it
// nothing is left to do.
import type { Module } from 'eb';
import { defineModule } from 'eb';

export const fight: Module = defineModule<Record<string, never>>({
  id: 'fight',
  init: () => ({}),
  actions: {},
  modes: { watch: { actions: ['world/*'] } },
});
