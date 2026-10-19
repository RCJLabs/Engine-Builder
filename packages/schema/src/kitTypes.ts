/**
 * The kits' record types (M3.3, D41, docs/specs/kits.md), as type files, so their forms and
 * tables work as a project's own types do, and a project's `types/<type>.json` can add fields
 * after a kit's. With a kit off, its type names are free for a project's own types.
 */
import { pointerSegment } from '@eb/core';
import {
  ACTOR,
  ECONOMY,
  FACTION,
  FACTIONS,
  GEAR,
  INVENTORY,
  ITEM,
  LOOT_TABLE,
  RESOURCE,
  SHOP,
  SLOT,
  STAT,
  STATS,
  STATUS,
} from '@eb/kits';
import { FACTION_SHOP_FIELDS, FACTION_TYPE_FILE } from './factionTypes.ts';
import { DESCRIPTION, NAME, TAGS } from './kitFields.ts';
import { actorTypeFile, SLOT_TYPE_FILE, STAT_TYPE_FILE, STATUS_TYPE_FILE, WORN_ITEM_FIELDS } from './statTypes.ts';
import type { FieldDef, Fields, TypeFile } from './typeFile.ts';
import { type DataType, typeFromFile } from './typeSchema.ts';

// Weights stay well under the 2^32 a draw can add up to, however many entries a table has.
const WEIGHT = 1_000_000;

/** From and To, each a whole number of at least `min`, as picks and counts have them. */
const range = (label: string, description: string, min: number): FieldDef => ({
  kind: 'group',
  optional: true,
  label,
  description,
  fields: {
    min: { kind: 'int', min, optional: true, label: 'From', description: `${min === 0 ? 1 : min} when left out` },
    max: { kind: 'int', min, optional: true, label: 'To', description: 'From, when left out' },
  },
});

export const ITEM_TYPE_FILE: TypeFile = {
  title: 'Item',
  description: 'Something the party carries. Shops price it from its value.',
  nameField: 'name',
  fields: {
    name: NAME,
    description: DESCRIPTION,
    value: { kind: 'int', min: 0, optional: true, label: 'Value', description: 'What it is worth: 0 when left out' },
    max: { kind: 'int', min: 1, optional: true, label: 'Most carried', description: 'No limit when left out' },
    tags: { ...TAGS, description: 'Words shops and conditions choose items by' },
  },
};

/** A loot table: its entries name a resource only with the economy kit on, as resources are its. */
function lootTableFile(resources: boolean): TypeFile {
  const entry: Fields = {
    item: { kind: 'ref', to: ITEM, optional: true, label: 'Item' },
    table: { kind: 'ref', to: LOOT_TABLE, optional: true, label: 'Table', description: 'Rolled when drawn' },
    ...(resources ? { resource: { kind: 'ref', to: RESOURCE, optional: true, label: 'Resource' } as FieldDef } : {}),
    weight: { kind: 'int', min: 1, max: WEIGHT, label: 'Weight' },
    count: range('Count', 'How many, or how many rolls of a table', 1),
    if: {
      kind: 'condition',
      optional: true,
      label: 'If',
      description: 'While this isn’t true, the entry is out of the roll',
    },
  };
  return {
    title: 'Loot table',
    description: 'Weighted entries drawn at random: items, resources or other tables.',
    nameField: 'name',
    fields: {
      name: NAME,
      description: DESCRIPTION,
      picks: range('Picks', 'How many draws a roll makes', 0),
      nothing: {
        kind: 'int',
        min: 0,
        max: WEIGHT,
        optional: true,
        label: 'Nothing',
        description: 'The weight of drawing nothing: 0 when left out',
      },
      unique: {
        kind: 'bool',
        optional: true,
        label: 'Each entry once',
        description: 'An entry is drawn at most once a roll',
      },
      entries: {
        kind: 'list',
        min: 1,
        label: 'Entries',
        description: resources ? 'Each names one item, table or resource' : 'Each names one item or table',
        of: { kind: 'group', fields: entry },
      },
    },
  };
}

export const RESOURCE_TYPE_FILE: TypeFile = {
  title: 'Resource',
  description: 'An amount the party holds: credits, fuel, food. Shops charge and pay in one.',
  nameField: 'name',
  fields: {
    name: NAME,
    description: DESCRIPTION,
    start: { kind: 'int', optional: true, label: 'Starts at', description: '0 when left out' },
    min: { kind: 'int', optional: true, label: 'Lowest', description: '0 when left out: it never goes below' },
    max: {
      kind: 'int',
      optional: true,
      label: 'Highest',
      description: 'No limit when left out: past it, the rest is lost',
    },
    step: {
      kind: 'int',
      min: 1,
      optional: true,
      label: 'Price step',
      description: 'Prices in it are multiples of this: 1 when left out',
    },
  },
};

export const SHOP_TYPE_FILE: TypeFile = {
  title: 'Shop',
  description: 'Sells from a shelf, and buys for a share of an item’s value.',
  nameField: 'name',
  fields: {
    name: NAME,
    description: DESCRIPTION,
    currency: { kind: 'ref', to: RESOURCE, label: 'Currency', description: 'What it charges and pays in' },
    'sells-at': {
      kind: 'int',
      min: 0,
      optional: true,
      label: 'Sells at (%)',
      description: 'The whole percent of an item’s value it charges: 100 when left out',
    },
    'buys-at': {
      kind: 'int',
      min: 0,
      optional: true,
      label: 'Buys at (%)',
      description: 'The whole percent it pays: 50 when left out, never above Sells at',
    },
    buys: {
      kind: 'group',
      optional: true,
      label: 'Buys',
      description: 'Left out, it buys nothing; with no tags, anything; with tags, items with one of them',
      fields: { tags: TAGS },
    },
    stock: {
      kind: 'group',
      optional: true,
      label: 'Stock',
      fields: {
        items: {
          kind: 'list',
          optional: true,
          label: 'Always',
          of: {
            kind: 'group',
            fields: {
              item: { kind: 'ref', to: ITEM, label: 'Item' },
              count: { kind: 'int', min: 1, optional: true, label: 'Count', description: '1 when left out' },
            },
          },
        },
        table: {
          kind: 'ref',
          to: LOOT_TABLE,
          optional: true,
          label: 'Table',
          description: 'Rolled for the rest of the shelf',
        },
        every: {
          kind: 'group',
          optional: true,
          label: 'Stocked again every',
          fields: { days: { kind: 'int', min: 1, label: 'Days' } },
        },
      },
    },
    rules: {
      kind: 'list',
      optional: true,
      label: 'Price rules',
      description: 'While a rule’s If is true, what the shop charges is multiplied by its percent',
      of: {
        kind: 'group',
        fields: { if: { kind: 'condition', label: 'If' }, percent: { kind: 'int', min: 0, label: 'Percent' } },
      },
    },
  },
};

/** An item that can be worn, with the gear kit on (M3.4). */
const WORN_ITEM_TYPE_FILE: TypeFile = { ...ITEM_TYPE_FILE, fields: { ...ITEM_TYPE_FILE.fields, ...WORN_ITEM_FIELDS } };

/** A shop that may name a faction, with the factions kit on (M3.5). */
const FACTION_SHOP_TYPE_FILE: TypeFile = {
  ...SHOP_TYPE_FILE,
  fields: { ...SHOP_TYPE_FILE.fields, ...FACTION_SHOP_FIELDS },
};

/** Each kit's types, by name, as the type files it has with the kits on: gear adds to items and actors, factions to shops. */
const OWN_TYPES: Readonly<Record<string, (on: readonly string[]) => Readonly<Record<string, TypeFile>>>> = {
  [INVENTORY]: (on) => ({
    [ITEM]: on.includes(GEAR) ? WORN_ITEM_TYPE_FILE : ITEM_TYPE_FILE,
    [LOOT_TABLE]: lootTableFile(on.includes(ECONOMY)),
  }),
  [ECONOMY]: (on) => ({
    [RESOURCE]: RESOURCE_TYPE_FILE,
    [SHOP]: on.includes(FACTIONS) ? FACTION_SHOP_TYPE_FILE : SHOP_TYPE_FILE,
  }),
  [STATS]: (on) => ({ [STAT]: STAT_TYPE_FILE, [ACTOR]: actorTypeFile(on.includes(GEAR)), [STATUS]: STATUS_TYPE_FILE }),
  [GEAR]: () => ({ [SLOT]: SLOT_TYPE_FILE }),
  [FACTIONS]: () => ({ [FACTION]: FACTION_TYPE_FILE }),
};

/** The type files of the kits on, by type name, in the kits' order. */
export function kitTypeFiles(on: readonly string[]): ReadonlyMap<string, TypeFile> {
  const files = new Map<string, TypeFile>();
  for (const kit of on) for (const [type, file] of Object.entries(OWN_TYPES[kit]?.(on) ?? {})) files.set(type, file);
  return files;
}

/** Whether a type name is a kit's, with these kits on: the engine's own for the project then (D41). */
export const isKitType = (name: string, on: readonly string[]): boolean => kitTypeFiles(on).has(name);

/** The kit a type is of, among the kits on. */
export function kitOf(name: string, on: readonly string[]): string | undefined {
  return on.find((kit) => Object.hasOwn(OWN_TYPES[kit]?.(on) ?? {}, name));
}

/** The kits' types with the kits on, without fields of a project's own. */
export function kitDataTypes(on: readonly string[]): DataType[] {
  return [...kitTypeFiles(on)].map(([type, file]) => typeFromFile(type, file));
}

/**
 * A project's types/<type>.json for a kit's type (D41), joined to the kit's: the kit's fields
 * first, then the file's, and the file's title, description and nameField over the kit's. Joined
 * before the file is read, so a nameField may name one of the kit's fields. The names the two
 * share are E037, and the file's fields are then left out.
 */
export function joinKitType(
  kitFile: TypeFile,
  raw: unknown,
): { readonly joined: unknown; readonly clashes: readonly string[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { joined: raw, clashes: [] };
  const own = raw as Record<string, unknown>;
  const fields = own.fields;
  const ownFields =
    typeof fields === 'object' && fields !== null && !Array.isArray(fields)
      ? (fields as Record<string, unknown>)
      : undefined;
  const clashes = Object.keys(ownFields ?? {}).filter((name) => Object.hasOwn(kitFile.fields, name));
  const base = {
    title: kitFile.title,
    ...(kitFile.description !== undefined ? { description: kitFile.description } : {}),
    ...(kitFile.nameField !== undefined ? { nameField: kitFile.nameField } : {}),
  };
  if (ownFields === undefined) return { joined: { ...base, ...own }, clashes };
  const added = clashes.length > 0 ? {} : ownFields;
  return { joined: { ...base, ...own, fields: { ...kitFile.fields, ...added } }, clashes };
}

/** E037 for a field of the project's with a kit field's name: the compiler's and the type designer's. */
export const kitClash = (
  kit: string,
  type: string,
  name: string,
): { readonly path: string; readonly message: string } => ({
  path: `/fields/${pointerSegment(name)}`,
  message: `The ${kit} kit's ${type} already has a field "${name}" (D41): name yours otherwise`,
});
