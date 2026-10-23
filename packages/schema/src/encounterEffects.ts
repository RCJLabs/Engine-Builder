/**
 * The encounters kit's effect (M4.7, D57, docs/specs/encounters.md#the-effect), as fields: fight,
 * with the stance a choice fights it in.
 */
import { ACTOR, ENCOUNTER, ENCOUNTERS } from '@eb/kits';
import type { EffectFile } from './kitEffects.ts';
import type { FieldDef } from './typeFile.ts';

const STANCE_MOST = 100;

const stance = (label: string, stat: string): FieldDef => ({
  kind: 'int',
  min: -STANCE_MOST,
  max: STANCE_MOST,
  optional: true,
  label,
  description: `Added to each of the party’s ${stat}, for this fight`,
});

export const ENCOUNTER_EFFECT_FILES: readonly EffectFile[] = [
  {
    effect: 'fight',
    kit: ENCOUNTERS,
    label: 'Fight',
    fields: {
      encounter: { kind: 'ref', to: ENCOUNTER, label: 'Encounter' },
      fighters: {
        kind: 'list',
        min: 1,
        optional: true,
        of: { kind: 'ref', to: ACTOR },
        label: 'Fighters',
        description: 'Who fights for the player, the front first: the encounter’s when left out',
      },
      hit: stance('Hit', 'hit'),
      dodge: stance('Dodge', 'dodge'),
      damage: stance('Damage', 'damage'),
      armour: stance('Armour', 'armour'),
    },
  },
];
