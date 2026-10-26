import type { Policy } from 'eb';
import { weightedPolicy } from 'eb';

type Turn = Parameters<Policy['choose']>[0];
type Offer = Turn['options'][number];

/** The behaviour that makes an actor fair game: the wanderer leaves everyone else be. */
const FOE = 'bandit';

// Fights and talk weigh most, waiting least, and nothing is put into a body.
const weighed = weightedPolicy('wanderer', {
  'world/use': 4,
  'world/trigger': 2,
  'dialogue/say': 3,
  'fighting/hit': 6,
  'fighting/search': 2,
  'inventory/take': 2,
  'inventory/put': 0,
  'hamlet/wait': 1,
});

const foe = (turn: Turn, actor: unknown) =>
  typeof actor === 'string' && turn.content.get<{ behaviour?: string }>('actor', actor)?.behaviour === FOE;

/** A blow the wanderer lets land: theirs at a bandit, or a bandit's at them. */
const fair = (turn: Turn, offer: Offer) => offer.type !== 'fighting/hit' || foe(turn, offer.on) || foe(turn, offer.by);

/**
 * The hamlet's bot: it uses what the space offers, says what talks offer, buys and sells, and
 * fights the bandits that stand near, at random. It never strikes the hamlet's own.
 */
export const wanderer: Policy = {
  name: 'wanderer',
  choose: (turn) => weighed.choose({ ...turn, options: turn.options.filter((offer) => fair(turn, offer)) }),
};
