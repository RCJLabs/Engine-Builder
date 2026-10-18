/** The kits' modules (M3.3, D41), apart from the list of kits so that reading the list costs no sim code. */
import type { Module } from '@eb/core';
import { economyKit } from './economy/module.ts';
import { inventoryKit } from './inventory/module.ts';
import { KITS } from './kits.ts';

const MODULES: ReadonlyMap<string, Module> = new Map([inventoryKit, economyKit].map((module) => [module.id, module]));

/** The modules of the kits on, in the engine's order. */
export const kitModules = (on: readonly string[]): Module[] =>
  KITS.filter((kit) => on.includes(kit.id)).map((kit) => MODULES.get(kit.id) as Module);
