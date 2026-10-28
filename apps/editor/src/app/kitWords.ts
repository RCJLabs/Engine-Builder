/**
 * The words beside each kit's box in the Project panel (M3.3, D41; ProjectKits.tsx): what it is called and what it
 * brings, as plain data so a test can hold every kit to having them.
 */

/** What each kit is called and brings, for the box beside it. */
export const KIT_WORDS: Readonly<Record<string, { readonly name: string; readonly brings: string }>> = {
  inventory: { name: 'Inventory', brings: 'Items, the party’s bag and loot tables.' },
  economy: { name: 'Economy', brings: 'Resources such as credits, and shops. Needs Inventory.' },
  stats: { name: 'Stats', brings: 'Actors, their stats and the damage they take, and statuses.' },
  gear: { name: 'Gear', brings: 'Slots, and items actors wear in them. Needs Stats and Inventory.' },
  factions: {
    name: 'Factions',
    brings: 'Standing with each faction, in bands that set shops’ prices and that conditions read.',
  },
  time: { name: 'Time', brings: 'Days, weeks, months and seasons, and rows that run as each one starts.' },
  roster: {
    name: 'Roster',
    brings: 'Members who join and leave, recruits rolled in halls, ranks on a stat, and bonds. Needs Stats.',
  },
  events: {
    name: 'Events',
    brings: 'Choice events, the decks they’re drawn from, and consequences that land days or choices later.',
  },
  dialogue: {
    name: 'Dialogue',
    brings: 'Speakers, and talks of lines and what the player says back, with a map of where each line leads.',
  },
  quests: {
    name: 'Quests',
    brings:
      'Quests of stages whose objectives check themselves, kept in a journal, with a map of where each stage leads.',
  },
  maps: {
    name: 'Maps',
    brings: 'Maps made from a seed by layered rules, or drawn by hand with roads, and the moves that travel them.',
  },
  encounters: {
    name: 'Encounters',
    brings: 'Foes to fight, worked out round by round with the odds shown exactly as they are rolled. Needs Stats.',
  },
  ai: {
    name: 'AI',
    brings:
      'Behaviours for NPCs: what each does by the hour, as a tree of steps, and what it sees and hears of the player. Needs Stats and Time.',
  },
  fighting: {
    name: 'Fighting',
    brings:
      'Weapons on items, blows and arrows in a walked space, NPCs who fall and bodies to search. Needs Stats, Gear and Encounters.',
  },
  tactics: {
    name: 'Tactics',
    brings:
      'Battles on a 2D space’s tilemap: sides taking turns, guns, cover, overwatch, orders and the enemy’s AI, with the odds shown as they are rolled. Needs Stats.',
  },
};
