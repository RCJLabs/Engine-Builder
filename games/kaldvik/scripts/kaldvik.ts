import type { Module } from 'eb';
import { defineModule } from 'eb';

/** The quest whose end ends the game. */
const MAIN = 'howe';

interface Kaldvik {
  ended: boolean;
}

/**
 * Walking Kaldvík. The stage sends what the player reaches, strikes and takes; this adds an hour
 * waited, which the HUD's button sends, and moves to the ending once the silver is home.
 */
export const kaldvik: Module = defineModule<Kaldvik>({
  id: 'kaldvik',
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
    ended: { read: ({ state }) => state.ended, domain: { type: 'bool' }, label: 'the silver is home' },
  },
  modes: {
    out: { actions: ['world/*', 'time/*', 'ai/*', 'fighting/*', 'kaldvik/*'] },
    ended: { actions: [] },
  },
});
