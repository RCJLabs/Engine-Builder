import type { Policy } from 'eb';

type Read = (id: string, args?: Record<string, unknown>) => unknown;
type Offer = { readonly type: string; readonly [key: string]: unknown };

const amount = (fact: Read, resource: string) => fact('economy.amount', { resource }) as number;
const held = (fact: Read, item: string) => fact('inventory.count', { item }) as number;

/** In an event, the choice a careful skipper makes: pay, feed and patch the boat, take work, else anything. */
function choose(options: readonly Offer[], fact: Read, pick: (from: readonly Offer[]) => Offer): Offer {
  const by = (choice: string) => options.find((o) => o.choice === choice);
  const hull = fact('stats.current', { actor: 'boat', stat: 'hull' }) as number;
  const wanted = [
    'pay',
    amount(fact, 'stores') < 6 ? 'provision' : '',
    hull < 6 ? 'patch' : '',
    'bell',
    'survey',
    'raise',
    'haul',
  ];
  for (const choice of wanted) {
    const found = choice === '' ? undefined : by(choice);
    if (found) return found;
  }
  return pick(options);
}

/**
 * A skipper who keeps the Kittiwake fed and patched, sells what she brings home, pays the
 * harbourmaster whenever the purse allows, and takes the contracts on the board. At sea, any way
 * on. It sees only what the game offers and its facts, as a player does.
 */
export const skipper: Policy = {
  name: 'skipper',
  choose({ options, rng, fact }) {
    const pick = (from: readonly Offer[]) => rng.pick(from);
    const of = (type: string) => options.filter((o) => o.type === type);
    const events = of('events/choose');
    if (events.length > 0) return choose(events, fact, pick);
    const sell = of('economy/sell');
    if (sell.length > 0) return pick(sell);
    const shop = [...of('economy/buy'), ...of('economy/leave')];
    if (shop.length > 0) {
      const net = shop.find((o) => o.type === 'economy/buy' && o.item === 'net');
      return net && amount(fact, 'coin') >= 30 ? net : (of('economy/leave')[0] ?? pick(shop));
    }
    const harbour = (verb: string) => options.find((o) => o.type === `harbour/${verb}`);
    const coin = amount(fact, 'coin');
    const salvage = held(fact, 'brass') + held(fact, 'copper');
    const hull = fact('stats.current', { actor: 'boat', stat: 'hull' }) as number;
    const wants = [
      coin >= 40 && amount(fact, 'debt') > 0 ? 'harbourmaster' : '',
      salvage > 0 ? 'chandlery' : '',
      (amount(fact, 'stores') < 6 || hull < 6) && coin >= 10 ? 'yard' : '',
      rng.chance(1, 3) ? 'contracts' : '',
      'set-sail',
      'hand-over',
    ];
    for (const verb of wants) {
      const found = verb === '' ? undefined : harbour(verb);
      if (found) return found;
    }
    return pick(options);
  },
};
