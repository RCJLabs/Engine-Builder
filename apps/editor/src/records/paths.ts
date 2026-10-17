/** Places in a record as words, for "used by" (M2.5). */
import { pointerKeys } from '@eb/core';
import type { FieldDef, TypeFile, ValueDef } from '@eb/schema';
import { labelOf } from '../forms/labels.ts';

/**
 * Where in a record a path points, in words: "School", "Skills, item 2", "Weapons carried: gladius",
 * "Wins and losses: Wins". A path the type doesn't describe reads as the path itself.
 */
export function describePath(file: TypeFile | undefined, pointer: string): string {
  if (!file) return pointer;
  const words: string[] = [];
  let def: ValueDef = { kind: 'group', fields: file.fields };
  for (const key of pointerKeys(pointer)) {
    if (def.kind === 'group' && Object.hasOwn(def.fields, key)) {
      const field: FieldDef = def.fields[key] as FieldDef;
      words.push(words.length === 0 ? labelOf(key, field) : `: ${labelOf(key, field)}`);
      def = field;
    } else if (def.kind === 'list' && /^\d+$/.test(key)) {
      words.push(`, item ${Number(key) + 1}`);
      def = def.of;
    } else if (def.kind === 'map') {
      words.push(`: ${key}`);
      def = def.of;
    } else return pointer;
  }
  return words.join('');
}
