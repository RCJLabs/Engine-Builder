import type { Policy } from 'eb';

/**
 * A lanista who takes nine bouts in ten, sending whoever is fit, and otherwise does whatever is
 * offered. It sees only what is offered: the odds are the player's to read.
 */
export const lanista: Policy = {
  name: 'lanista',
  choose({ options, rng }) {
    const bouts = options.filter((o) => o.type === 'events/choose' && o.choice !== 'decline');
    if (bouts.length > 0 && rng.chance(9, 10)) return rng.pick(bouts);
    return rng.pick(options);
  },
};
