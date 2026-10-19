/** The kits' modules (M3.3, D41), apart from the list of kits so that reading the list costs no sim code. */
import type { CalendarDef, Module } from '@eb/core';
import { economyKit } from './economy/module.ts';
import { ECONOMY } from './economy/types.ts';
import { factionsKit } from './factions/module.ts';
import { gearKit } from './gear/module.ts';
import { GEAR } from './gear/types.ts';
import { inventoryKit } from './inventory/module.ts';
import { KITS } from './kits.ts';
import { rosterModule } from './roster/module.ts';
import { ROSTER } from './roster/types.ts';
import { statsModule } from './stats/module.ts';
import { STATS } from './stats/types.ts';
import { timeKit } from './time/module.ts';
import { TIME } from './time/types.ts';

const MODULES: ReadonlyMap<string, Module> = new Map(
  [inventoryKit, economyKit, gearKit, factionsKit].map((module) => [module.id, module]),
);
// The stats module reads the gear kit's sums when gear is on (D42), so it comes in two builds.
const STATS_ALONE = statsModule(false);
const STATS_WITH_GEAR = statsModule(true);
// The roster charges a recruit's fee only with the economy kit on (W117).
const ROSTER_ALONE = rosterModule(false);
const ROSTER_WITH_ECONOMY = rosterModule(true);

/** The modules of the kits on, in the engine's order; the time kit's with the project's calendar (M3.5). */
export function kitModules(on: readonly string[], calendar?: CalendarDef): Module[] {
  return KITS.filter((kit) => on.includes(kit.id)).map((kit) => {
    if (kit.id === STATS) return on.includes(GEAR) ? STATS_WITH_GEAR : STATS_ALONE;
    if (kit.id === TIME) return timeKit(calendar);
    if (kit.id === ROSTER) return on.includes(ECONOMY) ? ROSTER_WITH_ECONOMY : ROSTER_ALONE;
    return MODULES.get(kit.id) as Module;
  });
}
