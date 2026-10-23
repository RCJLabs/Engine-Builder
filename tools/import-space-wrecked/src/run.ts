/**
 * Act 2, the run: the sides and their stations, the sector map's rules and node kinds, the system
 * past the charts and its kinds of world, and the balance numbers the scripts read.
 */
import { defined, idOf, type RecordSet } from './records.ts';
import type { Source } from './source.ts';

/** What arriving at a node of each kind does: the deck it draws from, or the script's own. */
const ARRIVE: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  station: [{ effect: 'dock' }],
  derelict: [{ effect: 'draw-event', deck: 'derelict' }],
  distress: [{ effect: 'draw-event', deck: 'distress' }],
  trader: [{ effect: 'draw-event', deck: 'trader' }],
  hazard: [{ effect: 'draw-event', deck: 'hazard' }],
  hostile: [{ effect: 'draw-event', deck: 'hostile' }],
};

/**
 * The balance numbers the scripts read, each with its original value (data/balance.json), and act
 * 1's lift-off from data/campaign.json. The rest are the tactical fight's, the approach's or act
 * 3's, which this rebuild doesn't carry.
 */
export const RULE_KEYS = [
  'jobHeat',
  'loudJobHeat',
  'huntHeat',
  'raidHeat',
  'heatAfterRaid',
  'baseSupplies',
  'jumpSupplies',
  'longJumpFactor',
  'supplyPrice',
  'hungerHp',
  'jumpHeat',
  'longJumpHeat',
  'scanHeat',
  'approachHeat',
  'patchPrice',
  'squadSize',
  'huntChance',
  'taskForceChance',
  'regroupHp',
  'regroupHeat',
  'hideHeat',
  'swapHeat',
  'swapPrice',
  'surveyHeat',
  'pursuerStanding',
  'jobStanding',
  'lostStanding',
  'shipStanding',
  'friendlyPay',
  'trustedPay',
  'dockHeat',
] as const;

export function importRun(source: Source, set: RecordSet): void {
  const b = source.balance;
  const band = (id: string, name: string, from: number | undefined, price: number) =>
    defined({ id, name, from, price });
  for (const side of source.factions.sides) {
    set.add('faction', side.id, {
      name: side.name,
      description: side.blurb,
      min: -10,
      max: 10,
      start: 0,
      bands: [
        band('hostile', 'Hostile', undefined, b.hostilePrice as number),
        band('cold', 'Cold', b.coldStanding, b.coldPrice as number),
        band('neutral', 'Neutral', b.neutralStanding, b.neutralPrice as number),
        band('friendly', 'Friendly', b.friendlyStanding, b.friendlyPrice as number),
        band('trusted', 'Trusted', b.trustedStanding, b.trustedPrice as number),
      ],
    });
  }
  // Every station the charts name, and the side that owns it: keyed by id, as the name is shown.
  for (const name of source.sectors.names.stations ?? []) {
    set.add('station', idOf(name), defined({ name, side: source.factions.stations[name] }));
  }

  for (const kind of source.sectors.nodes) {
    const list = kind.names ? source.sectors.names[kind.names] : undefined;
    set.add(
      'node-kind',
      kind.id,
      defined({
        name: kind.name,
        description: kind.text,
        names: list ? [...list] : undefined,
        charted: kind.charted,
        arrive: ARRIVE[kind.id],
      }),
    );
  }
  const counts = source.sectors.counts;
  const place = (kind: string) => {
    const range = counts[kind];
    if (!range) throw new Error(`No count for ${kind}`);
    return { kind, min: range[0], max: range[1], apart: true };
  };
  set.add('map', 'sector', {
    name: 'A sector',
    description: `${source.sectors.columns} jumps deep, from the way in to the jump point: two stations and a nebula on the charts, the rest unknown until the ship is near.`,
    layers: {
      count: source.sectors.columns,
      widths: { min: source.sectors.rows[0], max: source.sectors.rows[1] },
      start: 'start',
      end: 'exit',
      links: 'both',
      extra: source.sectors.extraLinkChance,
      place: Object.keys(counts).map(place),
      mix: Object.entries(source.sectors.mix).map(([kind, weight]) => ({ kind, weight })),
    },
    moves: [
      { id: 'jump', label: 'Jump', effects: [{ effect: 'jump' }] },
      { id: 'long', label: 'Long jump', reach: 2, effects: [{ effect: 'jump', long: true }] },
    ],
  });

  // The system past the charts: the way in and its worlds, every one in reach of the others.
  const worlds = source.worlds.system.worlds;
  const nodes = [{ id: 'way-in', kind: 'start', x: 10, y: 50 }];
  for (let i = 1; i <= worlds; i++)
    nodes.push({ id: `world-${i}`, kind: 'world', x: 35 + 25 * (i - 1), y: i % 2 === 0 ? 30 : 70 });
  const roads: { from: string; to: string }[] = [];
  for (let i = 1; i <= worlds; i++) {
    roads.push({ from: 'way-in', to: `world-${i}` });
    for (let j = i + 1; j <= worlds; j++) roads.push({ from: `world-${i}`, to: `world-${j}` });
  }
  set.add('map', 'system', {
    name: 'Past the charts',
    description: source.worlds.system.text,
    nodes,
    roads,
    start: 'way-in',
    moves: [{ id: 'fly', label: 'Fly there', effects: [{ effect: 'jump' }] }],
  });
  for (const kind of source.worlds.kinds) {
    set.add('world-kind', kind.id, { name: kind.name, text: kind.text, landing: kind.landing });
  }

  const rules: Record<string, number> = {};
  for (const key of RULE_KEYS) {
    const value = b[key];
    if (value === undefined) throw new Error(`No balance number ${key}`);
    rules[idOf(key.replace(/([A-Z])/g, ' $1'))] = value;
  }
  const liftOff = source.campaign.acts.find((act) => act.act === 1)?.liftOff;
  if (typeof liftOff !== 'number') throw new Error('No lift-off in act 1');
  set.add('rules', 'balance', {
    name: 'Balance',
    'sector-count': source.campaign.acts.find((act) => act.act === 2)?.sectors as number,
    'lift-off': liftOff,
    ...rules,
    'sector-names': [...(source.sectors.names.sectors ?? [])],
    'world-names': [...(source.worlds.names.worlds ?? [])],
  });
}
