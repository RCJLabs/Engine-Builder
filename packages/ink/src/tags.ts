/**
 * The tags a scene's lines carry (docs/specs/ink.md#tags): who says a line, what it does, a break
 * between lines, and on a choice, inside its brackets, its cost and what it needs. At the top, the
 * talk's name and whether its odds show. Any other tag is an error, since a tag nothing reads is
 * a typo the writer never hears of.
 */
import type { At, Tag } from './ast.ts';
import { parseExpr } from './expr.ts';
import { parseEffect } from './fx.ts';
import { InkError, shifted } from './problems.ts';

export const TAG_NAMES = ['speaker', 'fx', 'beat', 'cost', 'needs', 'name', 'show-odds'] as const;

const KEYED = /^([a-z-]+)\s*:\s*/;
const WORD = /^[A-Za-z0-9_-]+$/;
const COST = /^([a-z0-9]+(?:-[a-z0-9]+)*)\s+([0-9]+)$/;

/**
 * One tag's text, from just after its `#`, at `at`: the column there is the text's first. A column
 * in an error it throws counts from the text's start.
 */
export function parseTag(text: string, at: At): Tag {
  const trimmed = text.trim();
  const lead = text.length - text.trimStart().length;
  if (/[{}]/.test(trimmed)) throw new InkError('Tags are plain text: no { or }', lead + 1);
  if (trimmed === 'beat' || trimmed === 'show-odds') return { kind: trimmed, at };
  const keyed = KEYED.exec(trimmed);
  const name = keyed?.[1];
  if (keyed === null || name === undefined || !(TAG_NAMES as readonly string[]).includes(name)) {
    throw new InkError(`Unknown tag "${trimmed}": the engine reads # ${TAG_NAMES.join(', # ')}`, lead + 1);
  }
  const value = trimmed.slice(keyed[0].length).trim();
  const offset = lead + keyed[0].length;
  const valueAt: At = { line: at.line, column: (at.column ?? 1) + offset };
  switch (name) {
    case 'speaker':
      if (!WORD.test(value)) throw new InkError('A speaker tag names one speaker by id: # speaker: marge', offset + 1);
      return { kind: 'speaker', id: value, at: valueAt };
    case 'fx':
      return { kind: 'fx', effect: shifted(() => parseEffect(value), offset), at: valueAt };
    case 'cost':
      return { kind: 'cost', cost: costOf(value, offset), at: valueAt };
    case 'needs':
      return {
        kind: 'needs',
        needs: { expr: shifted(() => parseExpr(value), offset), at: valueAt, offset: (valueAt.column ?? 1) - 1 },
        at: valueAt,
      };
    case 'name':
      if (value === '') throw new InkError('A name tag gives the talk’s name: # name: Marge at the crag', offset + 1);
      return { kind: 'name', text: value, at: valueAt };
    default:
      throw new InkError(`# ${name} takes no value`, lead + 1);
  }
}

/** `rings 15, bread 2`: each resource and how many. */
function costOf(text: string, offset: number): Record<string, number> {
  const cost: Record<string, number> = {};
  for (const part of text.split(',')) {
    const found = COST.exec(part.trim());
    if (found === null)
      throw new InkError('Write a cost as each resource and how many: # cost: rings 15, bread 2', offset + 1);
    const [, resource, amount] = found as unknown as [string, string, string];
    if (Object.hasOwn(cost, resource)) throw new InkError(`${resource} is given twice`, offset + 1);
    cost[resource] = Number(amount);
  }
  return cost;
}
