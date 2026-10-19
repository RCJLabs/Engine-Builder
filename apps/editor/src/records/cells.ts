/**
 * What a table cell shows of a value, and the key it sorts by. A cell is one line of text, so
 * lists, maps and groups read as their items joined ("feint, shield wall"), and a ref reads as the
 * name of the record it names when its type has one.
 */
import { type Condition, checkCondition, printCondition } from '@eb/core';
import type { ValueDef } from '@eb/schema';
import { labelOf } from '../forms/labels.ts';
import { effectText } from '../logic/rowText.ts';

/** A record's name by "type:id", when its type names records and it has one. */
export type NameOf = (key: string) => string | undefined;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Enough of a long value for a cell; the cell's own width cuts it shorter. */
const MAX_CHARS = 160;
const clip = (text: string) => (text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text);

/** The JSON as written, for a value that isn't the shape its field says. */
const written = (value: unknown) => clip(JSON.stringify(value) ?? '');

/** The "type:id" a ref field's value names, or null when it isn't one. */
export function refKey(def: Extract<ValueDef, { kind: 'ref' }>, value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;
  return typeof def.to === 'string' ? `${def.to}:${value}` : value;
}

/** A cell's text: empty for a value the record leaves out. */
export function cellText(def: ValueDef, value: unknown, nameOf: NameOf): string {
  if (value === undefined) return '';
  switch (def.kind) {
    case 'text':
      return typeof value === 'string' ? clip(value.replace(/\s+/g, ' ').trim()) : written(value);
    case 'int':
    case 'number':
      return typeof value === 'number' ? String(value) : written(value);
    case 'bool':
      return value === true ? 'Yes' : value === false ? 'No' : written(value);
    case 'enum':
    case 'colour':
    case 'asset':
      return typeof value === 'string' ? value : written(value);
    case 'ref': {
      const key = refKey(def, value);
      return key === null ? written(value) : (nameOf(key) ?? (value as string));
    }
    case 'condition':
      if (typeof value === 'string') return clip(value);
      return isObject(value) && checkCondition(value).length === 0
        ? clip(printCondition(value as Condition))
        : written(value);
    case 'list':
      return Array.isArray(value) ? joined(value.map((item) => cellText(def.of, item, nameOf))) : written(value);
    case 'effects':
      // As a sheet row's card says them (M3.1): "give 2 × medkit, open dutch-yard".
      return Array.isArray(value) ? joined(value.map(effectText)) : written(value);
    case 'map': {
      if (!isObject(value)) return written(value);
      const keyDef = def.key;
      const keyText = (key: string) => (keyDef?.kind === 'ref' ? cellText(keyDef, key, nameOf) : key);
      return joined(Object.entries(value).map(([key, item]) => `${keyText(key)}: ${cellText(def.of, item, nameOf)}`));
    }
    case 'group':
      if (!isObject(value)) return written(value);
      return joined(
        Object.entries(def.fields)
          .filter(([name]) => value[name] !== undefined)
          .map(([name, field]) => `${labelOf(name, field)} ${cellText(field, value[name], nameOf)}`),
      );
  }
}

function joined(parts: readonly string[]): string {
  let text = '';
  for (const part of parts) {
    text = text === '' ? part : `${text}, ${part}`;
    if (text.length > MAX_CHARS) break;
  }
  return clip(text);
}

/**
 * What a value sorts by: a number for numbers, false and true, and a choice's place in its list;
 * the cell's text otherwise. Undefined for a value the record leaves out, which sorts last.
 */
export function sortKey(def: ValueDef, value: unknown, text: string): number | string | undefined {
  if (value === undefined) return undefined;
  if ((def.kind === 'int' || def.kind === 'number') && typeof value === 'number') return value;
  if (def.kind === 'bool' && typeof value === 'boolean') return value ? 1 : 0;
  if (def.kind === 'enum' && typeof value === 'string' && def.values.includes(value)) return def.values.indexOf(value);
  return text;
}
