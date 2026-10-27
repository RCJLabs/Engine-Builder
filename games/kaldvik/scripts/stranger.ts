import type { Policy } from 'eb';
import { weightedPolicy } from 'eb';

type Turn = Parameters<Policy['choose']>[0];
type Offer = Turn['options'][number];

/** Whose behaviour makes an actor fair game: the stranger leaves the townsfolk be. */
const FOES = new Set(['outlaw-north', 'outlaw-east', 'howe-guard']);

// Fights and talk weigh most, waiting least, and nothing is put into a body.
const weighed = weightedPolicy('stranger', {
  'world/use': 4,
  'world/trigger': 2,
  'dialogue/say': 3,
  'fighting/hit': 6,
  'fighting/search': 2,
  'fighting/rise': 1,
  'inventory/take': 3,
  'inventory/take-all': 2,
  'inventory/put': 0,
  'kaldvik/wait': 1,
});

const foe = (turn: Turn, actor: unknown) =>
  typeof actor === 'string' && FOES.has(turn.content.get<{ behaviour?: string }>('actor', actor)?.behaviour ?? '');

/** A blow the stranger lets land: theirs at an outlaw, or an outlaw's at them. */
const fair = (turn: Turn, offer: Offer) => offer.type !== 'fighting/hit' || foe(turn, offer.on) || foe(turn, offer.by);

/**
 * Kaldvík's bot: it uses what the space offers, says what talks offer, buys and sells, and fights
 * the outlaws near it, at random. It never strikes the townsfolk.
 */
export const stranger: Policy = {
  name: 'stranger',
  choose: (turn) => weighed.choose({ ...turn, options: turn.options.filter((offer) => fair(turn, offer)) }),
};
