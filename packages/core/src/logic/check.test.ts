import { describe, expect, it } from 'vitest';
import { catalog, records } from '../../test/logic-catalog.ts';
import { checkCondition } from './index.ts';

const issues = (condition: unknown, withCatalog = true) =>
  checkCondition(condition, withCatalog ? { catalog, records } : {}).map(
    ({ code, path, message }) => `${code} ${path}: ${message}`,
  );

describe('checkCondition: shape', () => {
  it.each([
    ['not an object', [1], ['E011 : A condition is an object with all, any, not or fact']],
    ['no kind', {}, ['E011 : A condition needs all, any, not or fact']],
    ['two kinds', { not: { fact: 'a.b' }, fact: 'a.b' }, ['E011 : Use one of not, fact']],
    ['an all of one', { all: [{ fact: 'a.b' }] }, ['E011 /all: all takes a list of two or more conditions']],
    ['an unknown field', { any: [{ fact: 'a.b' }, { fact: 'c.d' }], when: 1 }, ['E011 /when: Unknown field "when"']],
    ['a fact without a module', { fact: 'night' }, ['E011 /fact: A fact is "module.name", like "hold.count"']],
    [
      'empty args',
      { fact: 'a.b', args: {} },
      ['E011 /args: args holds argument values; leave it out when there are none'],
    ],
    [
      'a bad argument',
      { fact: 'a.b', args: { Item: 1 } },
      ['E011 /args/Item: An argument is name: number, text or true/false'],
    ],
    ['an unknown op', { fact: 'a.b', op: '=', value: 1 }, ['E011 /op: op is one of == != < <= > >=']],
    [
      'an op without a value',
      { fact: 'a.b', op: '==' },
      ['E011 : op and value go together: both, or neither for a yes/no fact'],
    ],
    [
      '-0',
      { fact: 'a.b', op: '==', value: -0 },
      ['E011 /value: A value is a number (no exponent), text or true/false'],
    ],
    [
      'an exponent',
      { fact: 'a.b', op: '<', value: 1e21 },
      ['E011 /value: A value is a number (no exponent), text or true/false'],
    ],
    [
      'NaN',
      { fact: 'a.b', op: '<', value: Number.NaN },
      ['E011 /value: A value is a number (no exponent), text or true/false'],
    ],
    [
      'a nested problem',
      { not: { all: [{ fact: 'a.b' }, { fact: 'a.b', value: 1 }] } },
      ['E011 /not/all/1: op and value go together: both, or neither for a yes/no fact'],
    ],
  ])('reports %s', (_name, condition, expected) => {
    expect(issues(condition, false)).toEqual(expected);
  });
});

describe('checkCondition: against the catalog', () => {
  it('accepts sound conditions', () => {
    for (const condition of [
      { fact: 'voyage.night' },
      { fact: 'hold.count', args: { item: 'medkit' }, op: '>=', value: 2 },
      {
        all: [
          { fact: 'voyage.sector', op: '!=', value: 'void' },
          { fact: 'voyage.leader', op: '==', value: 'rook' },
        ],
      },
      { fact: 'crew.trait', args: { member: 'kit', trait: 'brave' } },
      { fact: 'crew.mood', op: '==', value: 'calm' },
    ]) {
      expect(issues(condition)).toEqual([]);
    }
  });

  it.each([
    ['an unknown fact', { fact: 'hold.debt', op: '>', value: 0 }, ['E012 /fact: No fact "hold.debt"']],
    [
      'a missing argument',
      { fact: 'hold.count', op: '>', value: 0 },
      ['E013 : "hold.count" needs the argument "item"'],
    ],
    [
      'an extra argument',
      { fact: 'voyage.night', args: { where: 'rim' } },
      ['E013 /args/where: "voyage.night" has no argument "where"'],
    ],
    [
      'an argument of the wrong kind',
      { fact: 'crew.hp', args: { member: 3 }, op: '<', value: 3 },
      ['E013 /args/member: Expected the id of a record of type actor'],
    ],
    [
      'a record that does not exist',
      { fact: 'hold.count', args: { item: 'ghost' }, op: '>', value: 0 },
      ['E013 /args/item: No item record "ghost"'],
    ],
    ['an argument out of bounds', { fact: 'crew.slot', args: { index: 4 } }, ['E013 /args/index: Expected at most 3']],
    [
      'a fractional whole number',
      { fact: 'crew.slot', args: { index: 1.5 } },
      ['E013 /args/index: Expected a whole number'],
    ],
    [
      'a yes/no test of a number',
      { fact: 'hold.credits' },
      ['E014 : "hold.credits" is not a yes/no fact: compare it, like "hold.credits == …"'],
    ],
    [
      'an ordering of an enum',
      { fact: 'voyage.sector', op: '<', value: 'rim' },
      ['E014 /op: < compares numbers, and "voyage.sector" is not a number'],
    ],
    [
      'a value of the wrong type',
      { fact: 'voyage.night', op: '==', value: 1 },
      ['E014 /value: Expected true or false'],
    ],
    [
      'a value outside an enum',
      { fact: 'voyage.sector', op: '==', value: 'deep' },
      ['E014 /value: Expected one of: core, rim, void'],
    ],
    [
      'a leader nobody is',
      { fact: 'voyage.leader', op: '==', value: 'ghost' },
      ['E014 /value: No actor record "ghost"'],
    ],
  ])('reports %s', (_name, condition, expected) => {
    expect(issues(condition)).toEqual(expected);
  });

  it('checks the shape first, and the catalog only for sound tests', () => {
    expect(issues({ fact: 'hold.debt', op: '==' })).toEqual([
      'E011 : op and value go together: both, or neither for a yes/no fact',
    ]);
  });
});

describe('checkCondition: slots (M3.10)', () => {
  const slots = { mark: 'actor', loot: 'item' };
  // null: outside any quest.
  const slotted = (condition: unknown, given: Record<string, string> | null = slots) =>
    checkCondition(condition, { catalog, records, ...(given ? { slots: given } : {}) }).map(
      ({ code, path, message }) => `${code} ${path}: ${message}`,
    );

  it('takes a slot where an id of its type, or any text, goes', () => {
    expect(slotted({ fact: 'crew.hp', args: { member: '@mark' }, op: '>', value: 2 })).toEqual([]);
    expect(slotted({ fact: 'crew.trait', args: { member: '@mark', trait: '@loot' } })).toEqual([]);
    expect(slotted({ fact: 'voyage.leader', op: '==', value: '@mark' })).toEqual([]);
  });

  it.each([
    [
      'outside a quest',
      { fact: 'crew.hp', args: { member: '@mark' }, op: '>', value: 2 },
      null,
      ["E044 /args/member: @mark names a quest's slot, which only that quest's own fields can name"],
    ],
    [
      'a slot the quest lacks',
      { fact: 'crew.hp', args: { member: '@who' }, op: '>', value: 2 },
      slots,
      ['E044 /args/member: No slot who here: the slots are mark, loot'],
    ],
    [
      'no slots at all',
      { fact: 'crew.hp', args: { member: '@who' }, op: '>', value: 2 },
      {},
      ['E044 /args/member: No slot who here: none can be named'],
    ],
    [
      'a slot of another type',
      { fact: 'hold.count', args: { item: '@mark' }, op: '>', value: 0 },
      slots,
      ['E044 /args/item: mark holds an actor, not an item'],
    ],
    [
      'a slot where a number goes',
      { fact: 'crew.slot', args: { index: '@mark' } },
      slots,
      ['E044 /args/index: mark holds a record, not a number'],
    ],
    [
      'a slot compared with an enum',
      { fact: 'voyage.sector', op: '==', value: '@mark' },
      slots,
      ['E044 /value: mark holds a record, not one of: core, rim, void'],
    ],
    [
      'a slot named constructor',
      { fact: 'crew.hp', args: { member: '@constructor' }, op: '>', value: 2 },
      slots,
      ['E044 /args/member: No slot constructor here: the slots are mark, loot'],
    ],
  ])('reports %s', (_name, condition, given, expected) => {
    expect(slotted(condition, given)).toEqual(expected);
  });
});
