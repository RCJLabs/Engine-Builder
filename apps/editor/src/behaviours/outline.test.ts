/**
 * A behaviour's outline as plain functions (M6.3, D75): its rows and where each sits, the edits as
 * new trees and the path each leaves chosen, a node made another kind, its words and the pointers
 * its problems are shown at.
 */
import { describe, expect, it } from 'vitest';
import { behaviourPointers, rowPointers } from './nodeFields.ts';
import { lengthText, nodeText } from './nodeWords.ts';
import {
  addAfter,
  addInside,
  asKind,
  canRemove,
  canUnwrap,
  moveAt,
  newNode,
  removeAt,
  rowsOf,
  startUnit,
  unwrapAt,
  wrapAt,
} from './outline.ts';

const DAY = {
  first: [
    { if: 'ai.level(actor: @self) == alerted', cooldown: { minutes: 30 }, do: { face: 'player' } },
    { hours: [8, 18], do: { 'in-order': [{ work: 'forge' }, { wait: { minutes: 10 } }] } },
    { sleep: 'bed' },
  ],
};
const start = { unit: 'minutes', point: 'well' };
const settings = { units: ['ticks', 'days', 'minutes', 'hours'], points: ['bed', 'forge', 'well'] };

describe('the rows', () => {
  it('has a row a node, depth first, each with where it sits in the record', () => {
    expect(rowsOf(DAY).map((r) => [r.path, r.depth, r.kind, r.at.join('/')])).toEqual([
      ['', 0, 'first', 'do'],
      ['0', 1, 'guard', 'do/first/0'],
      ['0.0', 2, 'face', 'do/first/0/do'],
      ['1', 1, 'guard', 'do/first/1'],
      ['1.0', 2, 'in-order', 'do/first/1/do'],
      ['1.0.0', 3, 'work', 'do/first/1/do/in-order/0'],
      ['1.0.1', 3, 'wait', 'do/first/1/do/in-order/1'],
      ['2', 1, 'sleep', 'do/first/2'],
    ]);
    const work = rowsOf(DAY).find((r) => r.path === '1.0.0');
    expect(work).toMatchObject({ index: 0, siblings: 2, inList: true });
    expect(rowsOf(DAY).find((r) => r.path === '0.0')).toMatchObject({ inList: false });
  });

  it('still has a row for what isn’t a node yet', () => {
    expect(rowsOf({}).map((r) => [r.path, r.kind])).toEqual([['', undefined]]);
    expect(nodeText({})).toBe('Nothing yet: choose what it does');
  });
});

describe('the edits', () => {
  it('adds inside a list and after a step in one, choosing what it added', () => {
    const inside = addInside(DAY, '1.0', { travel: 'well' });
    expect(inside.path).toBe('1.0.2');
    expect(rowsOf(inside.root).find((r) => r.path === '1.0.2')?.node).toEqual({ travel: 'well' });
    const after = addAfter(DAY, '0', { wait: { minutes: 5 } });
    expect(after.path).toBe('1');
    expect((after.root as typeof DAY).first.map((n) => Object.keys(n)[0])).toEqual(['if', 'wait', 'hours', 'sleep']);
    // The tree it was given is left as it was.
    expect(DAY.first).toHaveLength(3);
  });

  it('moves a step within its list, and no further than its ends', () => {
    const down = moveAt(DAY, '0', 1);
    expect(down.path).toBe('1');
    expect((down.root as typeof DAY).first[1]).toBe(DAY.first[0]);
    expect(moveAt(DAY, '2', 1)).toEqual({ root: DAY, path: '2' });
    expect(moveAt(DAY, '0.0', -1)).toEqual({ root: DAY, path: '0.0' });
  });

  it('removes one of a list of more, choosing the one before it or its parent', () => {
    expect(canRemove(DAY, '1')).toBe(true);
    expect(canRemove(DAY, '0.0')).toBe(false);
    expect(canRemove(DAY, '')).toBe(false);
    const gone = removeAt(DAY, '1');
    expect(gone.path).toBe('0');
    expect((gone.root as typeof DAY).first).toHaveLength(2);
    expect(removeAt(DAY, '1.0.0').path).toBe('1.0');
    expect(removeAt(DAY, '0.0')).toEqual({ root: DAY, path: '0.0' });
  });

  it('wraps a step in a guard or a list, and unwraps one holding a single step', () => {
    const guarded = wrapAt(DAY, '2', 'guard');
    expect((guarded as typeof DAY).first[2]).toEqual({ do: { sleep: 'bed' } });
    expect(canUnwrap(guarded, '2')).toBe(true);
    expect(unwrapAt(guarded, '2')).toEqual(DAY);
    expect((wrapAt(DAY, '2', 'in-order') as typeof DAY).first[2]).toEqual({ 'in-order': [{ sleep: 'bed' }] });
    expect(canUnwrap(DAY, '')).toBe(false);
    expect(canUnwrap(DAY, '1.0')).toBe(false);
  });
});

describe('kinds', () => {
  it('starts each kind filled in from the calendar’s unit and a point of the space', () => {
    expect(newNode('patrol', start)).toEqual({ patrol: ['well'] });
    expect(newNode('sandbox', start)).toEqual({ sandbox: ['well'], dwell: { minutes: 10 } });
    expect(newNode('guard', start)).toEqual({ do: { wait: { minutes: 10 } } });
    expect(startUnit(['ticks', 'days', 'minutes'])).toBe('minutes');
    expect(startUnit(['ticks', 'days', 'watches'])).toBe('watches');
    expect(startUnit(['ticks', 'days'])).toBe('ticks');
  });

  it('keeps a list’s steps and a step’s points as its kind changes', () => {
    const list = DAY.first[1]?.do as unknown;
    expect(asKind(list, 'first', start)).toEqual({ first: [{ work: 'forge' }, { wait: { minutes: 10 } }] });
    expect(asKind({ work: 'forge' }, 'patrol', start)).toEqual({ patrol: ['forge'] });
    expect(asKind({ patrol: ['a', 'b'], dwell: { minutes: 2 } }, 'sandbox', start)).toEqual({
      sandbox: ['a', 'b'],
      dwell: { minutes: 2 },
    });
    expect(asKind({ patrol: ['a', 'b'] }, 'travel', start)).toEqual({ travel: 'a' });
    expect(asKind({ face: 'player' }, 'travel', start)).toEqual({ travel: 'well' });
  });
});

describe('words and pointers', () => {
  it('says each step in a few words', () => {
    const words = rowsOf(DAY).map((r) => nodeText(r.node));
    expect(words).toEqual([
      'The first that holds',
      'Only if ai.level(actor: @self) == alerted, then not for 30 minutes',
      'Face the player',
      'Only 8 to 18',
      'In order',
      'Work at forge',
      'Wait 10 minutes',
      'Sleep at bed',
    ]);
    expect(lengthText({ hours: 1, minutes: 30 })).toBe('1 hour and 30 minutes');
    expect(nodeText({ sandbox: ['a', 'b'], dwell: { minutes: 5 } })).toBe('Wander a, b, 5 minutes at each');
  });

  it('gives each step’s problems a place of its own, apart from its children’s', () => {
    const guard = rowsOf(DAY).find((r) => r.path === '0');
    expect(guard && rowPointers(guard, settings)).toEqual(
      expect.arrayContaining(['/do/first/0', '/do/first/0/hours', '/do/first/0/if', '/do/first/0/cooldown/minutes']),
    );
    expect(guard && rowPointers(guard, settings)).not.toContain('/do/first/0/do');
    const all = behaviourPointers(DAY, settings);
    for (const pointer of ['/do', '/do/first', '/do/first/1/do/in-order/0/work', '/do/first/2/sleep'])
      expect(all).toContain(pointer);
  });
});
