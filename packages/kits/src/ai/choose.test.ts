import type { Condition } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { chooseLeaf, type Now, withinHours } from './choose.ts';
import type { BehaviourNode } from './types.ts';

const at = (hour: number, more: Partial<Now> = {}): Now => ({ tick: 0, hour, check: () => true, ...more });
const on = (flag: string): Condition => ({ fact: 'flag.on', args: { flag } });

const TREE: BehaviourNode = {
  first: [
    { if: on('fire'), cooldown: { minutes: 30 }, do: { travel: 'well' } },
    { hours: [22, 6], days: ['sat', 'sun'], do: { sleep: 'bed' } },
    { 'in-order': [{ travel: 'forge' }, { wait: { minutes: 5 } }, { face: 'player' }] },
  ],
};

describe('withinHours', () => {
  it('runs from inclusive to exclusive, past midnight when the first is later', () => {
    expect([7, 8, 17, 18].map((h) => withinHours(h, [8, 18]))).toEqual([false, true, true, false]);
    expect([21, 22, 0, 5, 6].map((h) => withinHours(h, [22, 6]))).toEqual([false, true, true, true, false]);
  });
});

describe('chooseLeaf', () => {
  it('takes the first child that holds, a guard’s do while every guard holds', () => {
    expect(chooseLeaf(TREE, undefined, at(12))).toBe('0.0');
    const quiet = (c: Condition) => JSON.stringify(c) !== JSON.stringify(on('fire'));
    expect(chooseLeaf(TREE, undefined, at(23, { check: quiet, weekday: 'sat' }))).toBe('1.0');
    // Hours hold, the weekday doesn't: on to the in-order.
    expect(chooseLeaf(TREE, undefined, at(23, { check: quiet, weekday: 'mon' }))).toBe('2.0');
  });

  it('takes an in-order’s current child, and holds nothing back for a guard cooling down', () => {
    expect(chooseLeaf(TREE, { orders: { 2: 2 } }, at(12, { check: () => false }))).toBe('2.2');
    expect(chooseLeaf(TREE, { cool: { 0: 30 } }, at(12, { tick: 29 }))).toBe('2.0');
    expect(chooseLeaf(TREE, { cool: { 0: 30 } }, at(12, { tick: 30 }))).toBe('0.0');
  });

  it('holds nothing when no child does, and an unknown answer is not a yes', () => {
    const only: BehaviourNode = { first: [{ if: on('fire'), do: { travel: 'well' } }] };
    expect(chooseLeaf(only, undefined, at(12, { check: () => null }))).toBeUndefined();
    expect(
      chooseLeaf({ hours: [8, 9], do: { face: 'player' } }, undefined, { tick: 0, check: () => true }),
    ).toBeUndefined();
    expect(chooseLeaf({ travel: 'gate' }, undefined, at(0))).toBe('');
  });
});
