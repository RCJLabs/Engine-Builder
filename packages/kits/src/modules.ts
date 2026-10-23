/** The kits' modules (M3.3, D41), apart from the list of kits so that reading the list costs no sim code. */
import type { CalendarDef, Module } from '@eb/core';
import { dialogueModule } from './dialogue/module.ts';
import { DIALOGUE } from './dialogue/types.ts';
import { economyKit } from './economy/module.ts';
import { ECONOMY } from './economy/types.ts';
import { encountersModule } from './encounters/module.ts';
import { ENCOUNTERS } from './encounters/types.ts';
import { eventsModule } from './events/module.ts';
import { EVENTS } from './events/types.ts';
import { factionsKit } from './factions/module.ts';
import { gearKit } from './gear/module.ts';
import { GEAR } from './gear/types.ts';
import { inventoryKit } from './inventory/module.ts';
import { KITS } from './kits.ts';
import { mapsModule } from './maps/module.ts';
import { MAPS } from './maps/types.ts';
import { questsModule } from './quests/module.ts';
import { rosterModule } from './roster/module.ts';
import { ROSTER } from './roster/types.ts';
import { statsModule } from './stats/module.ts';
import { STATS } from './stats/types.ts';
import { timeKit } from './time/module.ts';
import { DEFAULT_CALENDAR, TIME } from './time/types.ts';

const MODULES: ReadonlyMap<string, Module> = new Map(
  [inventoryKit, economyKit, gearKit, factionsKit, questsModule].map((module) => [module.id, module]),
);
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

/** The modules of the kits on, in the engine's order; the time kit's with the project's calendar (M3.5). */
export function kitModules(on: readonly string[], calendar?: CalendarDef): Module[] {
  return KITS.filter((kit) => on.includes(kit.id)).map((kit) => {
    if (kit.id === STATS) return on.includes(GEAR) ? STATS_WITH_GEAR : STATS_ALONE;
    if (kit.id === TIME) return timeKit(calendar);
    if (kit.id === ROSTER) return on.includes(ECONOMY) ? ROSTER_WITH_ECONOMY : ROSTER_ALONE;
    if (kit.id === EVENTS) return on.includes(ECONOMY) ? EVENTS_WITH_ECONOMY : EVENTS_ALONE;
    if (kit.id === DIALOGUE) return on.includes(ECONOMY) ? DIALOGUE_WITH_ECONOMY : DIALOGUE_ALONE;
    if (kit.id === MAPS) {
      if (on.includes(TIME)) return mapsModule(on.includes(ECONOMY), calendar ?? DEFAULT_CALENDAR);
      return on.includes(ECONOMY) ? MAPS_WITH_ECONOMY : MAPS_ALONE;
    }
    if (kit.id === ENCOUNTERS) return on.includes(ROSTER) ? ENCOUNTERS_WITH_ROSTER : ENCOUNTERS_ALONE;
    return MODULES.get(kit.id) as Module;
  });
}
