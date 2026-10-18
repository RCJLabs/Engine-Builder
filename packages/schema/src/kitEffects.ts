/**
 * The kits' effects (M3.3, docs/specs/kits.md): each one's fields, written as type-file fields,
 * give both its schema, which content is checked against as the engine's own effects are (E001,
 * E025), and the form the editor draws for it, so the two can't drift apart.
 */
import { ECONOMY, INVENTORY, ITEM, LOOT_TABLE, RESOURCE, SHOP } from '@eb/kits';
import { z } from 'zod';
import { named } from './effect.ts';
import type { Fields } from './typeFile.ts';
import { fieldShape } from './typeSchema.ts';

export interface EffectFile {
  /** The effect's name, as content writes it: `{ "effect": "give-item" }`. */
  readonly effect: string;
  readonly kit: string;
  /** What the editor's list of effects to add calls it. */
  readonly label: string;
  /** In the order forms show them. */
  readonly fields: Fields;
}

const COUNT = { kind: 'int', min: 1, optional: true, label: 'Count', description: '1 when left out' } as const;

const FILES: EffectFile[] = [
  {
    effect: 'give-item',
    kit: INVENTORY,
    label: 'Give an item',
    fields: {
      item: { kind: 'ref', to: ITEM, label: 'Item' },
      count: { ...COUNT, description: '1 when left out; past the item’s Most carried, the rest is lost' },
    },
  },
  {
    effect: 'take-item',
    kit: INVENTORY,
    label: 'Take an item',
    fields: {
      item: { kind: 'ref', to: ITEM, label: 'Item' },
      count: { ...COUNT, description: '1 when left out; it refuses when the bag holds fewer' },
    },
  },
  {
    effect: 'roll-loot',
    kit: INVENTORY,
    label: 'Roll a loot table',
    fields: { table: { kind: 'ref', to: LOOT_TABLE, label: 'Table' } },
  },
  {
    effect: 'add-resource',
    kit: ECONOMY,
    label: 'Add to a resource',
    fields: {
      resource: { kind: 'ref', to: RESOURCE, label: 'Resource' },
      by: { kind: 'int', label: 'By', description: 'Below 0 takes away; it refuses to go below the lowest' },
    },
  },
  {
    effect: 'pay-cost',
    kit: ECONOMY,
    label: 'Pay a cost',
    fields: {
      cost: {
        kind: 'map',
        key: { kind: 'ref', to: RESOURCE },
        of: { kind: 'int', min: 1 },
        label: 'Cost',
        description: 'All of it or none: it refuses when any resource is short',
      },
    },
  },
  {
    effect: 'open-shop',
    kit: ECONOMY,
    label: 'Open a shop',
    fields: { shop: { kind: 'ref', to: SHOP, label: 'Shop' } },
  },
];

export const KIT_EFFECT_FILES: readonly EffectFile[] = Object.freeze(FILES);

/** An effect's schema from its fields: a strict object whose `effect` is its name, marked as the engine's own are. */
export const effectSchema = (file: EffectFile) =>
  named(file.effect, z.strictObject({ effect: z.literal(file.effect), ...fieldShape(file.fields) }));

/** The effects of the kits on, in the kits' order. */
export const kitEffectFiles = (on: readonly string[]): EffectFile[] =>
  on.flatMap((kit) => KIT_EFFECT_FILES.filter((file) => file.kit === kit));

const SCHEMAS = new Map(KIT_EFFECT_FILES.map((file) => [file.effect, effectSchema(file)]));

/** The schemas of the kits' effects that are on, made once. */
export const kitEffectSchemas = (on: readonly string[]): z.core.$ZodType[] =>
  kitEffectFiles(on).map((file) => SCHEMAS.get(file.effect) as z.core.$ZodType);
