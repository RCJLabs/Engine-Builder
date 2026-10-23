/**
 * The engine's own record types (M3.1, D36): flags and trigger sheets. Every project has them, with
 * or without a game's code, and no project's types/ or game's code can define a type of either name.
 */
import {
  EVENT_PATTERN,
  FLAG,
  NAME_PATTERN,
  RECORD_ID_PATTERN,
  type RowWhen,
  SHEET,
  type SheetRecord,
  type SheetRow,
} from '@eb/core';
import { z } from 'zod';
import { AUDIO_DATA } from './audioTypes.ts';
import { condition, valueSchema } from './condition.ts';
import { effect } from './effect.ts';
import { defineRecordType, type RecordType } from './recordType.ts';
import type { TypeFile } from './typeFile.ts';
import { type DataType, typeFromFile } from './typeSchema.ts';

/**
 * A flag, as a type file, so its forms and table work as a project's own types do. On or off
 * unless it has `number`; the bounds and start are checked beyond what a type file can say (E027).
 */
export const FLAG_TYPE_FILE: TypeFile = {
  title: 'Flag',
  description:
    'Something the game remembers: on or off, or with Number, a whole number. Effects set it; conditions read it.',
  nameField: 'name',
  fields: {
    name: { kind: 'text', optional: true, label: 'Name' },
    description: { kind: 'text', multiline: true, optional: true, label: 'Description' },
    number: {
      kind: 'group',
      optional: true,
      label: 'Number',
      description: 'Makes this flag a whole number, instead of on or off. Without it, the flag starts off.',
      fields: {
        start: { kind: 'int', optional: true, label: 'Starts at', description: '0 when left out' },
        min: { kind: 'int', optional: true, label: 'Lowest' },
        max: { kind: 'int', optional: true, label: 'Highest' },
      },
    },
  },
};

export const FLAG_TYPE: DataType = typeFromFile(FLAG, FLAG_TYPE_FILE);

const rowWhen = z.strictObject({
  event: z.string().regex(EVENT_PATTERN, { error: 'An event is "module/name", like "flag/changed"' }),
  args: z
    .record(
      z.string().regex(NAME_PATTERN, { error: 'An argument name is lowercase words joined by hyphens' }),
      valueSchema,
    )
    .optional(),
}) satisfies z.ZodType<RowWhen>;

const sheetRow = z.strictObject({
  id: z.string().regex(RECORD_ID_PATTERN, { error: 'A row id is lowercase words joined by hyphens' }),
  note: z.string().min(1, { error: 'Leave the note out, or write one' }).optional(),
  when: rowWhen,
  if: condition().optional(),
  do: z.array(effect()),
  once: z.boolean().optional(),
}) satisfies z.ZodType<SheetRow>;

export const SHEET_TYPE: RecordType<SheetRecord> = defineRecordType<SheetRecord>({
  type: SHEET,
  title: 'Trigger sheet',
  description: 'Rows of When an event happens, If a condition holds, Do these effects (docs/specs/triggers.md).',
  schema: z.strictObject({
    name: z.string().min(1, { error: 'Leave the name out, or write one' }).optional(),
    description: z.string().min(1, { error: 'Leave the description out, or write one' }).optional(),
    rows: z.array(sheetRow),
  }),
});

/**
 * A sheet's fields as a type file, for the editor's layout alone: the order new keys go in, where
 * each problem shows, the name lists show. Validation reads SHEET_TYPE; a test holds the two to
 * the same fields. When's arguments and Do's effects are only sketched here: the sheet editor
 * draws them itself.
 */
export const SHEET_TYPE_FILE: TypeFile = {
  title: 'Trigger sheet',
  description: 'Rows of When an event happens, If a condition holds, Do these effects.',
  nameField: 'name',
  fields: {
    name: { kind: 'text', optional: true, label: 'Name' },
    description: { kind: 'text', multiline: true, optional: true, label: 'Description' },
    rows: {
      kind: 'list',
      label: 'Rows',
      of: {
        kind: 'group',
        fields: {
          id: { kind: 'text', label: 'Id' },
          note: { kind: 'text', optional: true, label: 'Note' },
          when: {
            kind: 'group',
            label: 'When',
            fields: {
              event: { kind: 'text', label: 'Event' },
              args: { kind: 'map', optional: true, label: 'With', of: { kind: 'text' } },
            },
          },
          if: { kind: 'condition', optional: true, label: 'If' },
          do: { kind: 'list', label: 'Do', of: { kind: 'map', of: { kind: 'text' } } },
          once: { kind: 'bool', optional: true, label: 'Once' },
        },
      },
    },
  },
};

/** The sheet for forms: its layout from SHEET_TYPE_FILE, its checks from SHEET_TYPE. */
export const SHEET_DATA: DataType = Object.freeze({
  type: SHEET,
  file: SHEET_TYPE_FILE,
  recordType: SHEET_TYPE as RecordType,
});

/** The engine's own types' forms and checks: flags and sheets (M3.1), and sound, ambience and music (M4.8). */
export const ENGINE_DATA: readonly DataType[] = Object.freeze([FLAG_TYPE, SHEET_DATA, ...AUDIO_DATA]);

export const ENGINE_TYPES: readonly RecordType[] = Object.freeze(ENGINE_DATA.map((d) => d.recordType));

const ENGINE_NAMES: ReadonlySet<string> = new Set(ENGINE_DATA.map((d) => d.type));

/** Whether a type name is one of the engine's own, which projects and games can't define. */
export const isEngineType = (name: string): boolean => ENGINE_NAMES.has(name);

/**
 * The game's types with the engine's joined in front. Throws on a programmer error: a game's
 * code defining a type of the engine's names.
 */
export function withEngineTypes(types: readonly RecordType[]): readonly RecordType[] {
  const own = types.filter((t) => !ENGINE_TYPES.includes(t));
  for (const t of own) {
    if (isEngineType(t.type))
      throw new Error(`"${t.type}" is one of the engine's own record types (D36); name yours otherwise`);
  }
  return [...ENGINE_TYPES, ...own];
}
