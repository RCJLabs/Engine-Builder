import type { ValueDef } from '@eb/schema';
import type { Choice } from './Picker.tsx';

type RefDef = Extract<ValueDef, { kind: 'ref' }>;

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
