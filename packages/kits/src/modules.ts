/** The kits' modules (M3.3, D41), apart from the list of kits so that reading the list costs no sim code. */
import {
  type CalendarDef,
  type ClockDef,
  containersOf,
  type Module,
  type PackWorld,
  type WorldData,
  worldDataOf,
} from '@eb/core';
import { aiModule } from './ai/module.ts';
import { AI } from './ai/types.ts';
import { dialogueModule } from './dialogue/module.ts';
import { DIALOGUE } from './dialogue/types.ts';
import { economyKit } from './economy/module.ts';
import { ECONOMY } from './economy/types.ts';
import { encountersModule } from './encounters/module.ts';
import { ENCOUNTERS } from './encounters/types.ts';
import { eventsModule } from './events/module.ts';
import { EVENTS } from './events/types.ts';
import { factionsKit } from './factions/module.ts';
import { fightingModule } from './fighting/module.ts';
import { FIGHTING, type FightingDef } from './fighting/types.ts';
import { gearKit } from './gear/module.ts';
import { GEAR } from './gear/types.ts';
import { INVENTORY_WITH_BODIES, inventoryKit, inventoryModule } from './inventory/module.ts';
import { INVENTORY } from './inventory/types.ts';
import { KITS } from './kits.ts';
import { mapsModule } from './maps/module.ts';
import { MAPS } from './maps/types.ts';
import { questsModule } from './quests/module.ts';
import { QUESTS } from './quests/types.ts';
import { rosterModule } from './roster/module.ts';
import { ROSTER } from './roster/types.ts';
import { statsModule } from './stats/module.ts';
import { STATS } from './stats/types.ts';
import { tacticsModule } from './tactics/module.ts';
import { TACTICS } from './tactics/types.ts';
import { timeKit } from './time/module.ts';
import { DEFAULT_CALENDAR, TIME } from './time/types.ts';

const MODULES: ReadonlyMap<string, Module> = new Map(
  [inventoryKit, economyKit, gearKit, factionsKit].map((module) => [module.id, module]),
);
// The quests kit finds in the world only in a game with spaces (M6.7).
const QUESTS_ALONE = questsModule();
// The stats module reads the gear kit's sums when gear is on (D42), so it comes in two builds.
const STATS_ALONE = statsModule(false);
const STATS_WITH_GEAR = statsModule(true);
// The roster charges a recruit's fee only with the economy kit on (W117).
const ROSTER_ALONE = rosterModule(false);
const ROSTER_WITH_ECONOMY = rosterModule(true);
// Likewise a choice's cost (W119).
const EVENTS_ALONE = eventsModule(false);
const EVENTS_WITH_ECONOMY = eventsModule(true);
// And an option's (W119).
const DIALOGUE_ALONE = dialogueModule(false);
const DIALOGUE_WITH_ECONOMY = dialogueModule(true);
// A map's moves cost only with economy on, and take time only with time on, by its calendar (M4.6).
const MAPS_ALONE = mapsModule(false);
const MAPS_WITH_ECONOMY = mapsModule(true);
// The roster's members fight, and leave when they fall, only with the roster kit on (M4.7).
const ENCOUNTERS_ALONE = encountersModule(false);
const ENCOUNTERS_WITH_ROSTER = encountersModule(true);
// A battle is fought on its space's tilemap, which only a game with spaces has (M7.5).
const TACTICS_ALONE = tacticsModule();

/**
 * The modules of the kits on, in the engine's order; the time kit's with the project's calendar
 * (M3.5), and its clock when its spaces are walked (M6.3); the fighting kit's with project.json's
 * fighting when it has a world (M6.4), and the ai kit's hearing its hits when it is on; the quests
 * kit's with the world's places, where its slots find spaces and what is in them (M6.7); the inventory
 * kit's with the world's containers, the uses that hold items (M6.8); the tactics kit's with its
 * tilemaps (M7.5).
 */
export function kitModules(
  on: readonly string[],
  calendar?: CalendarDef,
  clock?: ClockDef,
  fighting?: FightingDef,
  world?: Pick<WorldData, 'places' | 'uses' | 'tiles'>,
): Module[] {
  const places = world?.places;
  return KITS.filter((kit) => on.includes(kit.id)).map((kit) => {
    if (kit.id === STATS) return on.includes(GEAR) ? STATS_WITH_GEAR : STATS_ALONE;
    if (kit.id === TIME) return timeKit(calendar, clock);
    if (kit.id === ROSTER) return on.includes(ECONOMY) ? ROSTER_WITH_ECONOMY : ROSTER_ALONE;
    if (kit.id === EVENTS) return on.includes(ECONOMY) ? EVENTS_WITH_ECONOMY : EVENTS_ALONE;
    if (kit.id === DIALOGUE) return on.includes(ECONOMY) ? DIALOGUE_WITH_ECONOMY : DIALOGUE_ALONE;
    if (kit.id === MAPS) {
      if (on.includes(TIME)) return mapsModule(on.includes(ECONOMY), calendar ?? DEFAULT_CALENDAR);
      return on.includes(ECONOMY) ? MAPS_WITH_ECONOMY : MAPS_ALONE;
    }
    if (kit.id === ENCOUNTERS) return on.includes(ROSTER) ? ENCOUNTERS_WITH_ROSTER : ENCOUNTERS_ALONE;
    if (kit.id === AI) return aiModule(calendar ?? DEFAULT_CALENDAR, on.includes(FIGHTING));
    if (kit.id === FIGHTING) return fightingModule(fighting);
    if (kit.id === QUESTS) return places === undefined ? QUESTS_ALONE : questsModule(places);
    if (kit.id === INVENTORY) return inventoryOf(world?.uses, on.includes(FIGHTING));
    if (kit.id === TACTICS) return world?.tiles === undefined ? TACTICS_ALONE : tacticsModule(world.tiles);
    return MODULES.get(kit.id) as Module;
  });
}

// Each inventory build the kits made, with whether it opens bodies: a game read before its world was
// known, as a project's game.ts is with the checking game's stand-in container, has one built for
// that world, which kitsInWorld builds again for the pack's (M6.9's bots found the stand-in kept).
const INVENTORY_BUILDS = new WeakMap<Module, boolean>([
  [inventoryKit, false],
  [INVENTORY_WITH_BODIES, true],
]);

/** The inventory kit with the world's containers, or one of its two builds when none of its uses holds items. */
function inventoryOf(uses: WorldData['uses'] | undefined, bodies: boolean): Module {
  const containers = containersOf(uses);
  if (Object.keys(containers).length === 0) return bodies ? INVENTORY_WITH_BODIES : inventoryKit;
  const built = inventoryModule(containers, bodies);
  INVENTORY_BUILDS.set(built, bodies);
  return built;
}

/**
 * The game's modules with the quests kit's built with the pack's places (M6.7), and the inventory kit's
 * with its containers (M6.8): for a game read before
 * its world was known, as eb sim's and the editor's Run are, beside core's withPackWorld. A game's own
 * module of the kit's id is left as it is.
 */
export function kitsInWorld(modules: readonly Module[], world: PackWorld | undefined): readonly Module[] {
  if (world === undefined) return modules;
  const { places, uses, tiles } = worldDataOf(world);
  return modules.map((m) => {
    if (m === QUESTS_ALONE && places !== undefined) return questsModule(places);
    if (m === TACTICS_ALONE && tiles !== undefined) return tacticsModule(tiles);
    const bodies = INVENTORY_BUILDS.get(m);
    if (bodies !== undefined) return inventoryOf(uses, bodies);
    return m;
  });
}
