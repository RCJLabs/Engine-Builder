import type { Policy } from 'eb';
import { capacityOf, checklist, credits, heatOf, shipStat, supplies } from './shared';

type Offer = { readonly type: string; readonly [key: string]: unknown };
type Turn = Parameters<Policy['choose']>[0];

/** The choices that move a quest on, or start one: tried first at any event. */
const QUEST_CHOICES = [
  'board',
  'pay',
  'haul',
  'tagjoin',
  'tag',
  'carryjoin',
  'carry',
  'signon',
  'drop',
  'towjoin',
  'tow',
  'help',
  'fund',
  'call',
  'face',
  'waved',
];
/** Each act-1 thread's job: on the board as its first, while the quest waits on it. */
const THREADS: Readonly<Record<string, string>> = { debt: 'losepaper', pardon: 'warrant', cargo: 'crates' };

const tagged = (turn: Turn, item: string, tag: string) =>
  (turn.content.get<{ tags?: string[] }>('item', item)?.tags ?? []).includes(tag);

/** The tags of the parts that would mend the checklist's failing lines: none once it passes. */
function wanted(turn: Turn): string[] {
  const check = checklist(turn.content, turn.fact);
  const tags: string[] = [];
  if (!check.parts) {
    for (const tag of ['bridge', 'reactor', 'engine', 'airlock'])
      if (shipStat(turn.fact, `${tag}s`) < 1) tags.push(tag);
  }
  if (!check.power) tags.push('reactor');
  if (!check.thrust) tags.push('engine');
  if (!check.berths) tags.push('quarters');
  if (!check.air) tags.push('lifesupport');
  return [...new Set(tags)];
}

/** A fight's chance to win, as the choice shows it: the preview's win outcome. */
function winChance(turn: Turn, encounter: string): number {
  const [preview] = turn.preview([{ effect: 'fight', encounter }]);
  const outcomes = (preview as { outcomes?: { result: string; chance: number }[] } | undefined)?.outcomes ?? [];
  return outcomes.find((o) => o.result === 'win')?.chance ?? 0;
}

function atEvent(turn: Turn, offers: readonly Offer[]): Offer {
  const open = turn.fact('events.open');
  if (open === 'board') {
    const thread = Object.entries(THREADS).some(([quest, job]) => turn.fact('quests.stage', { quest }) === job);
    const jobs = offers.filter((o) => String(o.choice).startsWith('job-'));
    const first = jobs.find((o) => o.choice === 'job-1');
    if (thread && first && turn.rng.chance(3, 4)) return first;
    const best = [...jobs].sort((a, b) => winChance(turn, String(b.choice)) - winChance(turn, String(a.choice)))[0];
    if (best) return best;
  }
  for (const choice of QUEST_CHOICES) {
    const found = offers.find((o) => o.choice === choice);
    if (found) return found;
  }
  const fight = offers.find((o) => o.choice === 'fight');
  if (fight && turn.rng.chance(3, 4)) return fight;
  return turn.rng.pick(offers);
}

/** In a shop: the cheapest part on the shelf that mends a failing line (the shop offers only what the purse covers). */
function inShop(turn: Turn, offers: readonly Offer[]): Offer | undefined {
  const tags = wanted(turn);
  const value = (offer: Offer) => turn.content.get<{ value?: number }>('item', String(offer.item))?.value ?? 0;
  const buys = offers.filter((o) => o.type === 'economy/buy' && tags.some((tag) => tagged(turn, String(o.item), tag)));
  const cheapest = [...buys].sort((a, b) => value(a) - value(b))[0];
  return cheapest ?? offers.find((o) => o.type === 'economy/leave');
}

/** At the hangar: fit what mends the checklist, launch when it passes, then pay, raid, shop or work. */
function atHangar(turn: Turn, offers: readonly Offer[]): Offer | undefined {
  const by = (type: string) => offers.find((o) => o.type === type);
  const tags = wanted(turn);
  const fit = offers.find((o) => o.type === 'refit/fit' && tags.some((tag) => tagged(turn, String(o.item), tag)));
  if (fit) return fit;
  const launch = by('campaign/launch');
  if (launch) return launch;
  const payment = by('campaign/pay');
  if (payment && heatOf(turn.fact) >= 60 && credits(turn.fact) >= 150) return payment;
  const raid = by('campaign/raid');
  if (raid) return raid;
  // The shop now and then, when the purse would buy a part the ship needs; otherwise the board. A
  // bot keeps nothing between turns, so it looks in by chance, not once a day.
  if (tags.length > 0 && credits(turn.fact) >= 80 && turn.rng.chance(1, 3))
    return by('campaign/shop') ?? by('campaign/jobs');
  return by('campaign/jobs') ?? payment;
}

const layerOf = (id: unknown) => Number(/^n(\d+)-/.exec(String(id))?.[1] ?? -1);

/** On the run: on toward the jump point, a long jump to shake off heat, the worlds at the end. */
function onRun(turn: Turn, offers: readonly Offer[]): Offer | undefined {
  const by = (type: string) => offers.find((o) => o.type === type);
  const settle = by('run/settle');
  if (settle) return settle;
  const onward = by('run/onward');
  if (onward) return onward;
  if (by('run/hide') && heatOf(turn.fact) >= 50) return by('run/hide');
  const here = turn.fact('maps.layer') as number;
  const moves = offers.filter((o) => o.type === 'maps/travel');
  const ahead = moves.filter((o) => layerOf(o.to) > here || layerOf(o.to) < 0);
  const long = ahead.filter((o) => o.move === 'long');
  if (long.length > 0 && heatOf(turn.fact) >= 40 && supplies(turn.fact) >= 20) return turn.rng.pick(long);
  const jumps = ahead.filter((o) => o.move !== 'long');
  if (jumps.length > 0) return turn.rng.pick(jumps);
  return moves.length > 0 ? turn.rng.pick(moves) : undefined;
}

/** Docked: supplies to fill the holds, patch up, now and then a recruit or a new transponder, then away. */
function docked(turn: Turn, offers: readonly Offer[]): Offer | undefined {
  const by = (type: string) => offers.find((o) => o.type === type);
  const buys = offers.filter((o) => o.type === 'run/buy').sort((a, b) => Number(b.crates) - Number(a.crates));
  if (buys[0] && supplies(turn.fact) < capacityOf(turn.content, turn.fact) - 5) return buys[0];
  if (by('run/patch')) return by('run/patch');
  if (by('run/swap') && heatOf(turn.fact) >= 60) return by('run/swap');
  if (by('run/hire') && credits(turn.fact) >= 120 && turn.rng.chance(1, 4)) return by('run/hire');
  return by('run/undock');
}

/**
 * A captain who builds the ship to the checklist, works the board for the fights with the best
 * odds and their own thread's job, pays the pursuer down when it runs hot, and then flies the run
 * to the first world, moving every quest on that comes up. It sees what a player sees: the options,
 * the facts and the odds a choice shows.
 */
export const captain: Policy = {
  name: 'captain',
  choose(turn) {
    const { options, rng } = turn;
    const of = (type: string) => options.filter((o) => o.type === type);
    if (of('campaign/begin').length > 0) return rng.pick(of('campaign/begin'));
    const events = of('events/choose');
    if (events.length > 0) return atEvent(turn, events);
    if (options.some((o) => o.type.startsWith('economy/'))) return inShop(turn, options) ?? rng.pick(options);
    const hire = of('roster/hire');
    if (hire.length > 0 || of('roster/leave-hall').length > 0) {
      const affordable = hire.filter(() => credits(turn.fact) >= 90);
      return affordable.length > 0 ? rng.pick(affordable) : (of('roster/leave-hall')[0] ?? rng.pick(options));
    }
    if (turn.fact('run.docked') === true) return docked(turn, options) ?? rng.pick(options);
    const act = turn.fact('campaign.act');
    const pick = act === 1 ? atHangar(turn, options) : onRun(turn, options);
    return pick ?? rng.pick(options);
  },
};
