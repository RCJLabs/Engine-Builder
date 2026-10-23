import type { Module } from 'eb';
import { defineModule } from 'eb';

/** Legs of the crossing, one passenger's scene each: add a scene and a row on the crossing sheet for a fifth. */
const LEGS = 4;

interface Ferry {
  leg: number;
  ashore: boolean;
}

/**
 * The ferry's last crossing. Who is aboard, what they say and what the player answers are ink
 * scenes; the crossing sheet opens one at each leg and the landing at the end, which sets the
 * flag the ending screen reads. This is only the rowing, and the night ending once the landing has.
 */
export const ferry: Module = defineModule<Ferry>({
  id: 'ferry',
  init: () => ({ leg: 0, ashore: false }),
  start: (ctx) => ctx.emit('cast-off', {}),
  actions: {
    'row-on': {
      run(ctx) {
        const leg = ctx.read().leg + 1;
        ctx.write().leg = leg;
        ctx.emit('rowed', { leg });
      },
      options: ({ state }) => (state.leg < LEGS ? [{}] : []),
    },
    'come-ashore': {
      run: (ctx) => ctx.emit('ashore', {}),
      options: ({ state }) => (state.leg >= LEGS ? [{}] : []),
    },
  },
  on: {
    'dialogue/ended': (ctx, event) => {
      if (event.talk !== 'landing' || ctx.read().ashore) return;
      ctx.write().ashore = true;
      ctx.modes.replace('ashore');
    },
  },
  facts: {
    leg: { read: ({ state }) => state.leg, domain: { type: 'int', min: 0, max: LEGS }, label: 'legs rowed' },
    ashore: { read: ({ state }) => state.ashore, domain: { type: 'bool' }, label: 'ashore' },
  },
  events: {
    'cast-off': { args: {}, label: 'The ferry casts off at dusk' },
    rowed: { args: { leg: { type: 'int', min: 1, max: LEGS } }, label: 'The ferry rows on a leg' },
    ashore: { args: {}, label: 'The ferry comes ashore' },
  },
  modes: {
    crossing: { actions: ['ferry/*'] },
    ashore: { actions: [] },
  },
});
