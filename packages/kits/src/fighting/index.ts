/** The fighting kit (M6.4, D76, docs/specs/combat.md): weapons, hits, falls and bodies in a walked space. */
export { fightingModule } from './module.ts';
export { fightingStage } from './stage.ts';
export {
  FALLEN,
  FIGHTING,
  FISTS,
  type FightingActor,
  type FightingDef,
  type FightingSlice,
  MELEE_DEFAULTS,
  type MeleeWeapon,
  RANGED_DEFAULTS,
  type RangedWeapon,
  type Weapon,
} from './types.ts';
export { combatOf, hurtOf, type Wielded, weaponOfItem, wielded } from './weapons.ts';
