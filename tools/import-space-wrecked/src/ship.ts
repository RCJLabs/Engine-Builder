/**
 * The ship: its stats, the parts as items it wears, the hull's slots, and the districts' shops
 * that sell them. A part's place on the hull isn't kept: the builder's layout has no stand-in
 * here (D62).
 */
import { defined, idOf, type RecordSet } from './records.ts';
import type { Module, Source } from './source.ts';

/** The ship's stats: what its parts add up to, and what the flight checklist reads. */
const SHIP_STATS = {
  power: { name: 'Power', description: 'What the reactors make, less what every other part uses', min: -999, start: 0 },
  mass: { name: 'Mass', description: 'What the engines have to lift' },
  thrust: { name: 'Thrust', description: 'What the engines push with' },
  berths: { name: 'Berths', description: 'Crew who can sleep aboard' },
  'life-support': { name: 'Life support', description: 'Crew the air and water keep' },
  cargo: { name: 'Cargo', description: 'Supplies the holds take, past the lockers' },
  hull: { name: 'Hull', description: 'The parts’ hit points, added up' },
  guns: { name: 'Guns', description: 'The weapons’ damage, added up' },
  shield: { name: 'Shield', description: 'What the shields stop' },
  intercept: { name: 'Intercept', description: 'The point defense’s chance to stop a shot' },
  heal: { name: 'Med bay', description: 'Hit points each crew member heals on a jump' },
  bridges: { name: 'Bridges', description: 'Parts with the bridge tag aboard' },
  reactors: { name: 'Reactors', description: 'Parts with the reactor tag aboard' },
  engines: { name: 'Engines', description: 'Parts with the engine tag aboard' },
  airlocks: { name: 'Airlocks', description: 'Parts with the airlock tag aboard' },
} as const;

/** A module's stats, by the ship stat each one adds to. */
const FROM_STATS: Readonly<Record<string, string>> = {
  power: 'power',
  mass: 'mass',
  thrust: 'thrust',
  berths: 'berths',
  lifeSupport: 'life-support',
  cargo: 'cargo',
  hp: 'hull',
};

/** The parts every ship needs (the original's REQUIRED_TAGS), each counted by a stat. */
export const COUNTED: Readonly<Record<string, string>> = {
  bridge: 'bridges',
  reactor: 'reactors',
  engine: 'engines',
  airlock: 'airlocks',
};

/** A maker's version, whole: the base part's fields with its own laid over them, stats too. */
export function wholeModule(source: Source, module: Module): Module {
  if (module.base === undefined) return module;
  const base = source.modules.modules.find((m) => m.id === module.base);
  if (!base) throw new Error(`No base part ${module.base}`);
  return { ...base, ...module, stats: { ...base.stats, ...module.stats } };
}

function modifiers(module: Module): { stat: string; add: number }[] {
  const out: { stat: string; add: number }[] = [];
  for (const [key, stat] of Object.entries(FROM_STATS)) {
    const add = module.stats[key] ?? 0;
    if (add !== 0) out.push({ stat, add });
  }
  const extra = { guns: module.damage, shield: module.shield, intercept: module.intercept, heal: module.heal };
  for (const [stat, add] of Object.entries(extra)) if (add) out.push({ stat, add });
  for (const tag of module.tags ?? []) {
    const stat = COUNTED[tag];
    if (stat) out.push({ stat, add: 1 });
  }
  return out;
}

export function importShip(source: Source, set: RecordSet): void {
  for (const [id, stat] of Object.entries(SHIP_STATS)) set.add('stat', id, stat);
  const makers = new Map(source.manufacturers.manufacturers.map((m) => [m.id, m]));
  for (const raw of source.modules.modules) {
    const part = wholeModule(source, raw);
    set.add(
      'item',
      part.id,
      defined({
        name: part.name,
        description: makers.get(part.manufacturer)?.name,
        value: part.cost,
        tags: ['part', ...(part.tags ?? [])],
        modifiers: modifiers(part),
        category: part.category,
        maker: part.manufacturer,
        base: part.base,
        size: part.size ? { w: part.size[0], h: part.size[1] } : undefined,
      }),
    );
  }

  // A hull has room for its frame's most parts, anywhere: a slot for each, taking any part.
  const frame = source.frames.frames[0];
  if (!frame) throw new Error('No frame');
  const slots: string[] = [];
  const width = String(frame.maxModules).length;
  for (let i = 1; i <= frame.maxModules; i++) {
    const id = `hull-${String(i).padStart(width, '0')}`;
    set.add('slot', id, { name: `Hull space ${i}`, takes: ['part'] });
    slots.push(id);
  }
  set.add('actor', 'ship', {
    name: 'Your ship',
    description: 'A half-built hull on a starter frame: the parts fitted to it make its stats.',
    slots,
  });

  for (const district of source.districts.districts) {
    const shop = idOf(district.shop.name);
    const table = `${shop}-stock`;
    set.add('loot-table', table, {
      name: `${district.shop.name}: the shelf`,
      picks: { min: district.shop.size },
      unique: true,
      entries: Object.entries(district.shop.parts).map(([item, weight]) => ({ item, weight })),
    });
    set.add('shop', shop, {
      name: district.shop.name,
      description: district.shop.pitch,
      currency: 'credits',
      'sells-at': source.balance.buyPercent,
      'buys-at': source.balance.sellPercent,
      buys: { tags: ['part'] },
      stock: { table, every: { days: 1 } },
    });
  }

  set.add('resource', 'credits', { name: 'Credits', step: 5 });
  set.add('resource', 'supplies', {
    name: 'Supplies',
    description: 'Food and air: a jump eats one for each of the crew',
  });
  set.add('resource', 'materials', {
    name: 'Materials',
    description: 'The colony’s: act 3, which this rebuild doesn’t reach',
  });
  set.add('flag', 'heat', {
    name: 'Heat',
    description: 'How close the pursuer is: hunters from 50, a raid from 75',
    number: { start: 0, min: 0, max: 100 },
  });
  set.add('flag', 'room', {
    name: 'Room aboard',
    description: 'The lesser of the berths and the life support: the most crew the roster takes',
    number: { start: 0, min: 0 },
  });
}
