/** The kits' modules (M3.3, D41), apart from the list of kits so that reading the list costs no sim code. */
import type { Module } from '@eb/core';
import { economyKit } from './economy/module.ts';
import { gearKit } from './gear/module.ts';
import { GEAR } from './gear/types.ts';
import { inventoryKit } from './inventory/module.ts';
import { KITS } from './kits.ts';
import { statsModule } from './stats/module.ts';
import { STATS } from './stats/types.ts';

const MODULES: ReadonlyMap<string, Module> = new Map(
  [inventoryKit, economyKit, gearKit].map((module) => [module.id, module]),
);
// The stats module reads the gear kit's sums when gear is on (D42), so it comes in two builds.
const STATS_ALONE = statsModule(false);
const STATS_WITH_GEAR = statsModule(true);

/** The modules of the kits on, in the engine's order. */
export const kitModules = (on: readonly string[]): Module[] =>
  KITS.filter((kit) => on.includes(kit.id)).map((kit) =>
    kit.id === STATS ? (on.includes(GEAR) ? STATS_WITH_GEAR : STATS_ALONE) : (MODULES.get(kit.id) as Module),
  );
