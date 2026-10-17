/**
 * A game the seed can't touch: one door, which opens. Every run of it ends in the same state, so
 * `eb sim` must say so, as 2060td's sweeps never did.
 */
import { defineModule } from '@eb/core';

const door = defineModule<{ open: boolean }>({
  id: 'door',
  init: () => ({ open: false }),
  actions: {
    open(ctx) {
      ctx.write().open = true;
      ctx.modes.replace('inside');
    },
  },
  modes: { hall: { actions: ['door/open'] }, inside: { actions: [] } },
});

export const recordTypes = [];
export const modules = [door];
export const start = 'hall';
