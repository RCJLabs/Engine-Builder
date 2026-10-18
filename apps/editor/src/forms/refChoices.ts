import type { DataType, ValueDef } from '@eb/schema';
import type { Choice } from './Picker.tsx';

type RefDef = Extract<ValueDef, { kind: 'ref' }>;

/**
 * The picker's title: one type by its title as a person reads it, with its article ("Choose an
 * item", "Choose a loot table"); several, a record.
 */
export function chooseTitle(def: RefDef, types: ReadonlyMap<string, DataType>): string {
  const noun = typeof def.to === 'string' ? (types.get(def.to)?.file.title ?? def.to).toLowerCase() : 'record';
  return `Choose ${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`;
}

/** Records' names by "type:id", where their types name them. */
export type Names = (key: string) => string | undefined;
export const noNames: Names = () => undefined;

/**
 * The records a ref field can name: bare ids for one type, "type:id" for several. A record whose
 * type names records shows its name, with the id it is written as (M2.5).
 */
export function refChoices(
  def: RefDef,
  records: ReadonlyMap<string, readonly string[]>,
  names: Names = noNames,
): Choice[] {
  const one = typeof def.to === 'string';
  return (one ? [def.to as string] : (def.to as readonly string[])).flatMap((type) =>
    (records.get(type) ?? []).map((id) => {
      const value = one ? id : `${type}:${id}`;
      const name = names(`${type}:${id}`);
      const label = name ? `${name} (${value})` : one ? id : `${id} (${type})`;
      return { value, label, ...(one && !name ? {} : { keywords: `${type} ${id}` }) };
    }),
  );
}
