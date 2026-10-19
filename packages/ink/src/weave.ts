/**
 * ink's weave (docs/specs/ink.md#choices-and-gathers): the choices and gathers of a knot, flat as
 * written, nested by their depth. A choice's body is what follows it up to the next choice or
 * gather as shallow; a gather joins the loose ends of the choices before it.
 */
import type { Item } from './ast.ts';
import type { Problems } from './problems.ts';

type ChoiceItem = Extract<Item, { kind: 'choice' }>;
type GatherItem = Extract<Item, { kind: 'gather' }>;
type ContentItem = Exclude<Item, ChoiceItem | GatherItem>;

export interface ChoiceBranch {
  readonly choice: ChoiceItem;
  readonly body: readonly Part[];
}

export type Part = ContentItem | GatherItem | { readonly kind: 'choices'; readonly choices: ChoiceBranch[] };

export function weave(items: readonly Item[], problems: Problems): Part[] {
  let index = 0;
  const level = (depth: number): Part[] => {
    const parts: Part[] = [];
    while (index < items.length) {
      const item = items[index] as Item;
      if (item.kind === 'choice' || item.kind === 'gather') {
        if (item.depth < depth) return parts;
        if (item.depth > depth) {
          const what = item.kind === 'choice' ? 'choice' : 'gather';
          problems.add(
            item.at,
            `This ${what} is deeper than the choices above it: ${depth} level${depth === 1 ? '' : 's'} at most here`,
          );
          index++;
          continue;
        }
      }
      index++;
      if (item.kind !== 'choice') {
        parts.push(item);
        continue;
      }
      const last = parts[parts.length - 1];
      const set = last?.kind === 'choices' ? last : { kind: 'choices' as const, choices: [] };
      if (set !== last) parts.push(set);
      set.choices.push({ choice: item, body: level(depth + 1) });
    }
    return parts;
  };
  return level(1);
}
