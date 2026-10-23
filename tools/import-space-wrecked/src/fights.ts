/**
 * Fights: the enemies, the encounters, and what fights them. Every fight is the encounters kit's,
 * one combat, `boarding`, over the crew's and enemies' imported stats (D62): the original's
 * tactical battles and the approach between ships aren't carried over. The hostile ships, the
 * hangar raids and the pursuers' ships on the run are events whose choices hold their fights, so
 * the odds a player sees are the ones rolled.
 */
import { fighterStats } from './crew.ts';
import { defined, idOf, type RecordSet } from './records.ts';
import type { Source } from './source.ts';

/** Enemies in a line, the front first: a run of the same kind is one entry with its count. */
export function foesOf(enemies: readonly string[]): { actor: string; count?: number }[] {
  const foes: { actor: string; count?: number }[] = [];
  for (const actor of enemies) {
    const last = foes.at(-1);
    if (last && last.actor === actor) last.count = (last.count ?? 1) + 1;
    else foes.push({ actor });
  }
  return foes;
}

const encounterOf = (source: Source, id: string) => {
  const found = source.encounters.encounters.find((e) => e.id === id);
  if (!found) throw new Error(`No encounter ${id}`);
  return found;
};

export function importFights(source: Source, set: RecordSet): void {
  const { chanceMin, chanceMax } = source.balance;
  set.add('combat', 'boarding', {
    name: 'Boarding',
    health: 'hp',
    hit: 'aim',
    dodge: 'defense',
    damage: 'damage',
    armour: 'armor',
    'hit-min': chanceMin,
    'hit-max': chanceMax,
  });
  for (const enemy of source.enemies.enemies) {
    const weapon = source.weapons.weapons.find((w) => w.id === enemy.weapon)?.name;
    set.add('actor', enemy.id, defined({ name: enemy.name, stats: fighterStats(source, enemy), weapon }));
  }
  for (const encounter of source.encounters.encounters) {
    set.add('encounter', encounter.id, { name: encounter.name, combat: 'boarding', foes: foesOf(encounter.enemies) });
  }
  importShips(source, set);
  importRaids(source, set);
}

/**
 * The ships that board or are boarded: each with its party as an encounter that pays its scrap
 * and salvage on a win, and an event to fight or run. The hostile node's ships come from a deck;
 * the pursuers' are opened by the run script when they find the ship.
 */
function importShips(source: Source, set: RecordSet): void {
  const hostile = source.sectors.nodes.find((n) => n.id === 'hostile');
  const sides = new Map(source.factions.sides.map((s) => [s.id, s]));
  const { fleeChance, approachHeat, shipStanding } = source.balance;
  const pursuers = new Set(
    source.backgrounds.backgrounds.flatMap((b) => [b.pursuer.run.hunters, b.pursuer.run.taskForce]),
  );
  for (const ship of source.ships.ships) {
    if (!ship.party) continue;
    const id = `ship-${ship.id}`;
    const pays = ship.scrap !== undefined || ship.salvage !== undefined;
    if (pays) {
      set.add('loot-table', id, {
        name: `${ship.name}: salvage`,
        picks: { min: 2 },
        unique: true,
        entries: [
          ...(ship.scrap
            ? [{ resource: 'credits', weight: 1, count: { min: ship.scrap[0], max: ship.scrap[1] } }]
            : []),
          { table: 'salvage', weight: 1, count: { min: ship.salvage ?? 1 } },
        ],
      });
    }
    set.add(
      'encounter',
      id,
      defined({
        name: ship.name,
        description: `Her boarding party: ${encounterOf(source, ship.party).name}.`,
        combat: 'boarding',
        foes: foesOf(encounterOf(source, ship.party).enemies),
        // Boarding a side's ship costs standing with it (shipStanding).
        win: [
          ...(pays ? [{ effect: 'roll-loot', table: id }] : []),
          ...(ship.side ? [{ effect: 'change-standing', faction: ship.side, by: -shipStanding }] : []),
          // Facing the pursuer's own ship drops heat to heatAfterRaid: they have to send for another.
          ...(pursuers.has(ship.id) ? [{ effect: 'set-flag', flag: 'heat', to: source.balance.heatAfterRaid }] : []),
        ],
      }),
    );
    const fight = { effect: 'fight', encounter: id };
    const patrol = ship.side
      ? (sides.get(ship.side) as { patrol?: { waved: string; fired: string } } | undefined)?.patrol
      : undefined;
    set.add('event', id, {
      name: ship.name,
      text: shipText(source, ship.id) ?? hostile?.text ?? ship.name,
      'show-odds': true,
      choices: [
        // A Fleet patrol waves a friend of the Fleet on (factions.json's patrol).
        ...(patrol && ship.side
          ? [
              {
                id: 'waved',
                label: 'Show your transponder',
                if: `factions.reached(faction: ${ship.side}, band: friendly)`,
                result: patrol.waved,
              },
            ]
          : []),
        {
          id: 'fight',
          label: 'Fight them off',
          effects: [fight],
        },
        {
          id: 'run',
          label: 'Run for it',
          outcomes: [
            {
              chance: fleeChance,
              result: 'The engines hold, and the ship outruns them. Every band heard the chase.',
              effects: [{ effect: 'add-to-flag', flag: 'heat', by: approachHeat }],
            },
            { chance: 100 - fleeChance, result: 'They close before the engines can open the gap.', effects: [fight] },
          ],
        },
      ],
    });
  }
  const cutter = source.sectors.nodes.find((n) => n.id === 'hostile')?.ships ?? [];
  set.add('deck', 'hostile', {
    name: 'Hostile ships',
    description: 'Who a hostile node turns out to be.',
    events: cutter.map((entry) =>
      defined({
        event: `ship-${entry.ship}`,
        weight: entry.weight,
        if: entry.from ? `maps.entered >= ${entry.from}` : undefined,
      }),
    ),
  });
}

/** What a pursuer's ship says as it finds the crew: its level's words, from the background. */
function shipText(source: Source, ship: string): string | undefined {
  for (const background of source.backgrounds.backgrounds) {
    const { run } = background.pursuer;
    if (run.hunters === ship) return run.levels.hunters;
    if (run.taskForce === ship) return run.levels.taskForce;
  }
  return undefined;
}

/**
 * The hangar raid of each background's pursuer: its raiders, faced as an event. Won or lost, heat
 * falls to heatAfterRaid; lost, they take the dearest part on hand, or half the credits.
 */
function importRaids(source: Source, set: RecordSet): void {
  const after = { effect: 'set-flag', flag: 'heat', to: source.balance.heatAfterRaid };
  for (const background of source.backgrounds.backgrounds) {
    const { pursuer } = background;
    const id = `raid-${background.id}`;
    const raiders = encounterOf(source, pursuer.raiders);
    set.add('encounter', id, {
      name: raiders.name,
      description: `${pursuer.name} at the hangar door.`,
      combat: 'boarding',
      foes: foesOf(raiders.enemies),
      win: [after],
      lose: [after, { effect: 'raid-loss' }],
    });
    set.add('event', id, {
      name: `${pursuer.name} at the door`,
      text: pursuer.levels.raid,
      'show-odds': true,
      choices: [{ id: 'face', label: 'Face them', effects: [{ effect: 'fight', encounter: id }] }],
    });
    set.add('pursuer', idOf(pursuer.name), {
      name: pursuer.name,
      side: pursuer.side,
      description: pursuer.blurb,
      levels: { ...pursuer.levels },
      hunters: [...pursuer.hunters],
      raid: id,
      ...(pursuer.payment ? { payment: { ...pursuer.payment } } : {}),
      run: {
        levels: Object.fromEntries(
          Object.entries(pursuer.run.levels).map(([key, text]) => [idOf(key.replace(/([A-Z])/g, ' $1')), text]),
        ),
        hunters: `ship-${pursuer.run.hunters}`,
        'task-force': `ship-${pursuer.run.taskForce}`,
        faced: pursuer.run.faced,
      },
    });
  }
}
