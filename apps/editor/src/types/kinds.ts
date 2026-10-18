/** The words the type designer (M2.6) uses for kinds and for what a field holds. */
import { FIELD_KINDS, type FieldKind } from '@eb/schema';
import { humanize } from '../forms/labels.ts';
import { isObject, kindOf } from './defPaths.ts';

export const KIND_NAMES: Record<FieldKind, string> = {
  text: 'Text',
  int: 'Whole number',
  number: 'Number',
  bool: 'Yes or no',
  enum: 'Choice',
  ref: 'Record',
  list: 'List',
  map: 'Map',
  group: 'Group of fields',
  colour: 'Colour',
  asset: 'File',
  condition: 'Condition',
};

/** The kinds in the order the designer offers them: the format's own. */
export const KINDS: readonly FieldKind[] = FIELD_KINDS;

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** "1 to 40 characters", "at least 1 item", or '' without bounds. */
function bounds(def: Record<string, unknown>, unit?: string): string {
  const min = typeof def.min === 'number' ? def.min : undefined;
  const max = typeof def.max === 'number' ? def.max : undefined;
  const of = (n: number) => (unit ? plural(n, unit) : String(n));
  if (min !== undefined && max !== undefined) return `${min} to ${unit ? of(max) : max}`;
  if (min !== undefined) return `at least ${of(min)}`;
  return max !== undefined ? `at most ${of(max)}` : '';
}

const typeList = (to: unknown, title: (type: string) => string): string => {
  const types = typeof to === 'string' ? [to] : Array.isArray(to) ? to.filter((t) => typeof t === 'string') : [];
  return types.map(title).join(' or ');
};

/** What a def holds, in a few words: "Whole number, 0 to 100", "Record: School or Beast", "List of text". */
export function summary(node: unknown, title: (type: string) => string): string {
  const kind = kindOf(node);
  if (!kind || !isObject(node)) return 'Not a field the format knows';
  const def = node;
  const item = (of: unknown) => summary(of, title).toLowerCase();
  const parts: string[] = [];
  switch (kind) {
    case 'text':
      parts.push(def.multiline ? 'Text, several lines' : 'Text', bounds(def, 'character'));
      break;
    case 'int':
    case 'number':
      parts.push(KIND_NAMES[kind], bounds(def));
      break;
    case 'enum':
      parts.push(`Choice of ${Array.isArray(def.values) ? def.values.length : 0}`);
      break;
    case 'ref':
      parts.push(`Record: ${typeList(def.to, title) || 'no type'}`);
      break;
    case 'list':
      parts.push(`List of ${item(def.of)}`, bounds(def, 'item'));
      break;
    case 'map': {
      const key = kindOf(def.key);
      const by =
        key === 'ref' ? typeList((def.key as Record<string, unknown>).to, title) : key === 'enum' ? 'choice' : 'name';
      parts.push(`Map of ${item(def.of)}, by ${by}`);
      break;
    }
    case 'group':
      parts.push(`Group of ${plural(isObject(def.fields) ? Object.keys(def.fields).length : 0, 'field')}`);
      break;
    case 'asset':
      parts.push(typeof def.of === 'string' ? `File: ${def.of}` : 'File');
      break;
    default:
      parts.push(KIND_NAMES[kind]);
  }
  if (def.optional === true) parts.push('optional');
  return parts.filter(Boolean).join(', ');
}

/** What forms call a field: its label, or its name in words. */
export const fieldLabel = (name: string, def: unknown): string =>
  isObject(def) && typeof def.label === 'string' && def.label !== '' ? def.label : humanize(name);

/** "the record that holds it", "the 3 records that hold it": the records a change reaches. */
export const holdersOf = (count: number): string =>
  count === 1 ? 'the record that holds it' : `the ${count} records that hold it`;
