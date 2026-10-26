// The post's one mode: walked, and a day waited, so there is always something on offer and the days go by.
import type { Module } from 'eb';
import { defineModule } from 'eb';

export const post: Module = defineModule<Record<string, never>>({
  id: 'post',
  init: () => ({}),
  actions: {
    wait: { run: (ctx) => ctx.apply({ effect: 'wait', days: 1 }), options: () => [{}] },
  },
  modes: { out: { actions: ['world/*', 'post/wait'] } },
});
