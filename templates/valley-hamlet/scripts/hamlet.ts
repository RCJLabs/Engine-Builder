import type { Module } from 'eb';
import { defineModule } from 'eb';

/** The quest whose end ends the game: change it, and the ending screen, to end on another. */
const MAIN = 'bandits';

interface Hamlet {
  ended: boolean;
}

/**
 * Walking the valley. The stage sends what the player reaches, strikes and takes; this adds an
 * hour waited, which the HUD's button sends, and moves to the ending once the main quest is done.
 */
export const hamlet: Module = defineModule<Hamlet>({
  id: 'hamlet',
  init: () => ({ ended: false }),
  actions: {
    wait: { run: (ctx) => ctx.apply({ effect: 'wait', hours: 1 }), options: () => [{}] },
  },
  on: {
    'quests/done': (ctx, event) => {
      if (event.quest !== MAIN || ctx.read().ended) return;
      ctx.write().ended = true;
      ctx.modes.replace('ended');
    },
  },
  facts: {
    ended: { read: ({ state }) => state.ended, domain: { type: 'bool' }, label: 'the hamlet is safe' },
  },
  modes: {
    out: { actions: ['world/*', 'time/*', 'ai/*', 'fighting/*', 'hamlet/*'] },
    ended: { actions: [] },
  },
});
