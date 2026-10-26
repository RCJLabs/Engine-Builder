/**
 * A quest's world slots checked (M6.7, D79, docs/specs/radiant.md#checks): each way E088 fires, and
 * W127 for a slot nothing in the project carries the tags of, read from the spaces' tags.
 */
import type { Slot } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { checkWorldSlot, findsInWorld, type SpaceTags } from './worldSlots.ts';

const TAGS: SpaceTags = {
  spaces: new Map([
    ['barrow', ['cave']],
    ['green', []],
    ['mine', ['cave', 'deep']],
  ]),
  objects: new Map([
    ['barrow', new Map([['cache', ['cache']]])],
    ['mine', new Map([['stash/chest', ['cache', 'old']]])],
  ]),
  actors: new Map([
    ['wick', ['chief']],
    ['moss', []],
  ]),
};
const NONE: SpaceTags = { spaces: new Map(), objects: new Map(), actors: new Map() };

/** Each problem as `code path message`; `null` stands for spaces not read. */
function problems(slots: readonly Partial<Slot>[], tags: SpaceTags | null = TAGS): string[] {
  const found: string[] = [];
  slots.forEach((_, i) =>
    checkWorldSlot(
      slots as Slot[],
      i,
      (code, path, message) => found.push(`${code} ${path} ${message}`),
      tags ?? undefined,
    ),
  );
  return found;
}

const cave = { id: 'cave', type: 'space', tags: ['cave'] };

describe('a quest’s world slots', () => {
  it('knows which slots find in the world', () => {
    expect(findsInWorld({ type: 'space' })).toBe(true);
    expect(findsInWorld({ type: 'object' })).toBe(true);
    expect(findsInWorld({ type: 'actor' })).toBe(false);
    expect(findsInWorld({ type: 'actor', in: 'barrow' })).toBe(true);
    expect(findsInWorld({ type: 'actor', tags: ['chief'] })).toBe(true);
    expect(findsInWorld({ type: 'item', tags: ['x'] })).toBe(false);
  });

  it('passes slots that can be filled', () => {
    expect(
      problems([
        cave,
        { id: 'cache', type: 'object', in: '@cave', tags: ['cache'] },
        { id: 'chief', type: 'actor', in: '@cave', tags: ['chief'], pick: 'nearest' },
        { id: 'old', type: 'object', in: 'mine', tags: ['old'] },
      ]),
    ).toEqual([]);
  });

  it('gives E088 for each way a world slot can’t be read', () => {
    const codes = (slots: readonly Partial<Slot>[], tags?: SpaceTags) =>
      problems(slots, tags).map((p) => p.split(' ').slice(0, 2).join(' '));
    expect(codes([{ id: 'x', type: 'item', pick: 'nearest' }])).toEqual(['E088 /slots/0/pick']);
    expect(codes([{ id: 'x', type: 'item', in: 'barrow' }])).toEqual(['E088 /slots/0/in']);
    expect(codes([{ id: 'x', type: 'space', in: 'barrow' }])).toEqual(['E088 /slots/0/in']);
    expect(codes([{ id: 'x', type: 'item', tags: ['cave'] }])).toEqual(['E088 /slots/0/tags']);
    expect(codes([{ id: 'x', type: 'space', record: 'barrow', tags: ['cave'] }])).toEqual(['E088 /slots/0/record']);
    expect(codes([cave], NONE)).toEqual(['E088 /slots/0/type']);
    expect(codes([cave, { id: 'c', type: 'object', tags: ['cache'] }])).toEqual(['E088 /slots/1/in']);
    expect(codes([cave, { id: 'c', type: 'object', in: '@cave' }])).toEqual(['E088 /slots/1/tags']);
    expect(codes([{ id: 'c', type: 'object', in: '@cave', tags: ['cache'] }, cave])).toEqual(['E088 /slots/0/in']);
    expect(codes([{ id: 'c', type: 'object', in: '@ghost', tags: ['cache'] }])).toEqual(['E088 /slots/0/in']);
    expect(
      codes([
        { id: 'who', type: 'actor', record: 'wick' },
        { id: 'c', type: 'object', in: '@who', tags: ['cache'] },
      ]),
    ).toEqual(['E088 /slots/1/in']);
    expect(codes([{ id: 'c', type: 'object', in: 'attic', tags: ['cache'] }])).toEqual(['E088 /slots/0/in']);
  });

  it('gives W127 for tags nothing in the project carries, where the slot can be found', () => {
    expect(problems([{ id: 'x', type: 'space', tags: ['den'] }])).toEqual([
      'W127 /slots/0/tags No space carries the tags "den", so this slot can never be filled',
    ]);
    // The barrow and the mine are caves, and only the mine is deep: a cache there is old, a deep cave's.
    expect(
      problems([
        { ...cave, tags: ['cave', 'deep'] },
        { id: 'c', type: 'object', in: '@cave', tags: ['old'] },
      ]),
    ).toEqual([]);
    expect(problems([{ id: 'c', type: 'object', in: 'barrow', tags: ['old'] }])).toEqual([
      'W127 /slots/0/tags Nothing in the spaces it can be in carries the tags "old", so this slot can never be filled',
    ]);
    expect(problems([{ id: 'who', type: 'actor', tags: ['chief', 'old'] }])).toEqual([
      'W127 /slots/0/tags Nothing placed carries the tags "chief" and "old", so this slot can never be filled',
    ]);
  });

  it('checks only the slot’s own fields where the spaces aren’t read', () => {
    expect(problems([{ id: 'x', type: 'space', tags: ['den'] }], null)).toEqual([]);
    expect(problems([cave, { id: 'c', type: 'object', tags: ['cache'] }], null).map((p) => p.slice(0, 16))).toEqual([
      'E088 /slots/1/in',
    ]);
  });
});
