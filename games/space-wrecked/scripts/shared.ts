// What the Space-Wrecked scripts share: the balance numbers, the crew aboard, the ship's stats and
// the flight checklist. Each reads only facts and records, so modules stay out of each other's
// slices.

/** Reads a fact, as a module's context, a view and a bot's choose all can. */
export type Read = (id: string, args?: Record<string, unknown>) => unknown;

interface Store {
  get<T>(type: string, id: string): T | undefined;
  getOrThrow<T>(type: string, id: string): T;
  ids(type: string): readonly string[];
}

/** data/balance.json's numbers that acts 1 and 2 read, as the import wrote them (records/rules/balance.json). */
export interface Rules {
  readonly 'sector-count': number;
  readonly 'lift-off': number;
  readonly 'flight-thrust': number;
  readonly 'job-heat': number;
  readonly 'loud-job-heat': number;
  readonly 'hunt-heat': number;
  readonly 'raid-heat': number;
  readonly 'heat-after-raid': number;
  readonly 'base-supplies': number;
  readonly 'jump-supplies': number;
  readonly 'long-jump-factor': number;
  readonly 'supply-price': number;
  readonly 'hunger-hp': number;
  readonly 'jump-heat': number;
  readonly 'long-jump-heat': number;
  readonly 'scan-heat': number;
  readonly 'patch-price': number;
  readonly 'hunt-chance': number;
  readonly 'task-force-chance': number;
  readonly 'regroup-hp': number;
  readonly 'regroup-heat': number;
  readonly 'hide-heat': number;
  readonly 'swap-heat': number;
  readonly 'swap-price': number;
  readonly 'survey-heat': number;
  readonly 'pursuer-standing': number;
  readonly 'job-standing': number;
  readonly 'lost-standing': number;
  readonly 'friendly-pay': number;
  readonly 'trusted-pay': number;
  readonly 'dock-heat': number;
  readonly 'sector-names': readonly string[];
  readonly 'world-names': readonly string[];
}

export const rulesOf = (content: Store): Rules => content.getOrThrow<Rules>('rules', 'balance');

export interface Background {
  readonly name: string;
  readonly district: string;
  readonly credits: number;
  readonly parts: Readonly<Record<string, number>>;
  readonly crew: readonly string[];
  readonly ship: readonly string[];
  readonly captain: string;
  readonly pursuer: string;
  readonly launch: string;
  readonly escaped: string;
}

export interface Pursuer {
  readonly name: string;
  readonly side: string;
  readonly levels: Readonly<Record<string, string>>;
  readonly hunters: readonly string[];
  readonly raid: string;
  readonly payment?: { readonly name: string; readonly text: string; readonly credits: number; readonly heat: number };
  readonly run: {
    readonly levels: Readonly<Record<string, string>>;
    readonly hunters: string;
    readonly 'task-force': string;
    readonly faced: string;
  };
}

export const backgroundOf = (content: Store, fact: Read): Background | undefined => {
  const id = fact('campaign.background') as string | undefined;
  return id === undefined ? undefined : content.getOrThrow<Background>('background', id);
};

export const pursuerOf = (content: Store, fact: Read): Pursuer | undefined => {
  const background = backgroundOf(content, fact);
  return background && content.getOrThrow<Pursuer>('pursuer', background.pursuer);
};

/** Everyone on the roster now, in the order they joined: the start crew and recruits are made actors. */
export function crewOf(content: Store, fact: Read): string[] {
  return content
    .ids('actor')
    .filter((actor) => fact('roster.member', { actor }) === true)
    .sort((a, b) => (fact('roster.place', { actor: a }) as number) - (fact('roster.place', { actor: b }) as number));
}

export const shipStat = (fact: Read, stat: string): number => fact('stats.value', { actor: 'ship', stat }) as number;
export const heatOf = (fact: Read): number => fact('flag.number', { flag: 'heat' }) as number;
export const credits = (fact: Read): number => fact('economy.amount', { resource: 'credits' }) as number;
export const supplies = (fact: Read): number => fact('economy.amount', { resource: 'supplies' }) as number;

/** A crew member's job, as the actor it copies says: what their station edges are. */
export const jobOf = (content: Store, actor: string): string | undefined =>
  content.get<{ job?: string }>('actor', actor)?.job;

/**
 * The flight checklist's part lines (the original's constraints.js): power, thrust for the mass,
 * berths and life support for the crew, and a bridge, reactor, engine and airlock. Act 1 asks
 * lift-off's thrust; after it, the frame's. The layout line has no stand-in (D62).
 */
export function checklist(content: Store, fact: Read): Record<string, boolean> {
  const rules = rulesOf(content);
  const crew = fact('roster.count') as number;
  const percent = fact('campaign.act') === 1 ? rules['lift-off'] : rules['flight-thrust'];
  const thrust = shipStat(fact, 'thrust');
  return {
    power: shipStat(fact, 'power') >= 0,
    thrust: thrust > 0 && thrust * 100 >= percent * shipStat(fact, 'mass'),
    berths: shipStat(fact, 'berths') >= crew,
    air: shipStat(fact, 'life-support') >= crew,
    parts: ['bridges', 'reactors', 'engines', 'airlocks'].every((stat) => shipStat(fact, stat) >= 1),
  };
}

export const flies = (content: Store, fact: Read): boolean => Object.values(checklist(content, fact)).every(Boolean);

/** What the holds take: the lockers, a quartermaster's deeper ones, and the cargo holds. */
export function capacityOf(content: Store, fact: Read): number {
  const rules = rulesOf(content);
  const lockers = crewOf(content, fact).some((actor) => jobOf(content, actor) === 'quartermaster') ? 10 : 0;
  return rules['base-supplies'] + lockers + shipStat(fact, 'cargo');
}

/** Rounds down to a step: prices and pay go in fives. */
export const stepped = (n: number, step = 5): number => step * Math.floor(n / step);
