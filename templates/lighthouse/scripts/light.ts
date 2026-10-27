import type { Module } from 'eb';
import { defineModule } from 'eb';

/** The quest whose end ends the game: change it, and the ending screen, to end on another. */
const MAIN = 'light';

interface Light {
  lit: boolean;
}

/**
 * Walking the rock and the tower. The stage sends what the player reaches and takes; this moves to
 * the ending once the lamp is lit and its quest done.
 */
export const light: Module = defineModule<Light>({
  id: 'light',
  init: () => ({ lit: false }),
  on: {
    'quests/done': (ctx, event) => {
      if (event.quest !== MAIN || ctx.read().lit) return;
      ctx.write().lit = true;
      ctx.modes.replace('lit');
    },
  },
  facts: {
    lit: { read: ({ state }) => state.lit, domain: { type: 'bool' }, label: 'the lamp is lit' },
  },
  modes: {
    out: { actions: ['world/*'] },
    lit: { actions: [] },
  },
});
