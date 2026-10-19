import type { TypeFile, ValueDef } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { inputMode } from './fields/NumberField.tsx';
import {
  defAt,
  emptyValue,
  getIn,
  moveItem,
  newRecord,
  parseNumber,
  renameKey,
  roundToStep,
  setIn,
  sliderStep,
  withKey,
} from './values.ts';

const gladiator: TypeFile = {
  title: 'Gladiator',
  fields: {
    name: { kind: 'text', min: 1 },
    might: { kind: 'int', min: 0, max: 100 },
    title: { kind: 'text', optional: true },
    school: { kind: 'ref', to: 'school' },
    skills: { kind: 'list', of: { kind: 'group', fields: { name: { kind: 'text' }, level: { kind: 'int', min: 1 } } } },
    kit: { kind: 'map', of: { kind: 'int' }, optional: true },
    record: { kind: 'group', fields: { wins: { kind: 'int', min: 0 }, draws: { kind: 'int', optional: true } } },
  },
};

describe('emptyValue and newRecord', () => {
  it.each<[ValueDef, unknown]>([
    [{ kind: 'text' }, ''],
    [{ kind: 'int' }, 0],
    [{ kind: 'int', min: 3 }, 3],
    [{ kind: 'int', max: -2 }, -2],
    [{ kind: 'number', min: 0.5 }, 0.5],
    [{ kind: 'bool' }, false],
    [{ kind: 'enum', values: ['b', 'a'] }, 'b'],
    [{ kind: 'ref', to: 'school' }, ''],
    [{ kind: 'list', of: { kind: 'int' } }, []],
    [{ kind: 'map', of: { kind: 'int' } }, {}],
    [{ kind: 'colour' }, '#000000'],
    [{ kind: 'asset' }, ''],
    [{ kind: 'condition' }, ''],
    [{ kind: 'effects' }, []],
  ])('gives %j %j', (def, expected) => {
    expect(emptyValue(def)).toEqual(expected);
  });

  it('fills a new record’s required fields, nested groups too, and leaves optional ones out', () => {
    expect(newRecord(gladiator)).toEqual({
      name: '',
      might: 0,
      school: '',
      skills: [],
      record: { wins: 0 },
    });
  });
});

describe('defAt and getIn', () => {
  it('follow a path through groups, lists and maps', () => {
    expect(defAt(gladiator, ['skills', 2, 'level'])).toEqual({ kind: 'int', min: 1 });
    expect(defAt(gladiator, ['kit', 'net'])).toEqual({ kind: 'int' });
    expect(defAt(gladiator, ['horse'])).toBeUndefined();
    expect(defAt(gladiator, ['name', 0])).toBeUndefined();
    const value = { skills: [{ name: 'feint' }], kit: { net: 1 } };
    expect(getIn(value, ['skills', 0, 'name'])).toBe('feint');
    expect(getIn(value, ['kit', 'net'])).toBe(1);
    expect(getIn(value, ['skills', 'x'])).toBeUndefined();
    expect(getIn(value, ['kit', 0])).toBeUndefined();
  });
});

describe('setIn', () => {
  it('changes a value where it is, copying only what is on its way', () => {
    const before = { name: 'Spiculus', might: 72, skills: [{ name: 'feint', level: 2 }], record: { wins: 1 } };
    const after = setIn(before, ['skills', 0, 'level'], 3, gladiator) as typeof before;
    expect(after).toEqual({ name: 'Spiculus', might: 72, skills: [{ name: 'feint', level: 3 }], record: { wins: 1 } });
    expect(before.skills[0]?.level).toBe(2);
    expect(after.record).toBe(before.record);
    expect(Object.keys(after)).toEqual(['name', 'might', 'skills', 'record']);
  });

  it('puts a new key where the type lists it among the keys there, whatever order the file has', () => {
    const value = { might: 72, name: 'Spiculus', record: { wins: 1 } };
    expect(Object.keys(setIn(value, ['school'], 'ludus', gladiator) as object)).toEqual([
      'might',
      'name',
      'school',
      'record',
    ]);
    expect(Object.keys(setIn(value, ['title'], 'the Great', gladiator) as object)).toEqual([
      'might',
      'name',
      'title',
      'record',
    ]);
    expect(Object.keys(setIn({ record: { draws: 1 } }, ['record', 'wins'], 2, gladiator) as object)).toEqual([
      'record',
    ]);
    expect(
      Object.keys((setIn({ record: { draws: 1 } }, ['record', 'wins'], 2, gladiator) as { record: object }).record),
    ).toEqual(['wins', 'draws']);
  });

  it('puts a key the type doesn’t list last, as a map’s keys go', () => {
    const value = { kit: { net: 1, trident: 1 } };
    expect(Object.keys((setIn(value, ['kit', 'gladius'], 1, gladiator) as typeof value).kit)).toEqual([
      'net',
      'trident',
      'gladius',
    ]);
  });

  it('removes a key, or a list item, given undefined', () => {
    expect(setIn({ name: 'a', title: 'b' }, ['title'], undefined, gladiator)).toEqual({ name: 'a' });
    expect(setIn({ skills: [1, 2, 3] }, ['skills', 1], undefined, gladiator)).toEqual({ skills: [1, 3] });
  });

  it('makes what is missing on the way, and keeps "__proto__" an ordinary key', () => {
    expect(setIn({}, ['record', 'wins'], 1, gladiator)).toEqual({ record: { wins: 1 } });
    const map = setIn({ kit: {} }, ['kit', '__proto__'], 1, gladiator) as { kit: object };
    expect(Object.hasOwn(map.kit, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(map.kit)).toBe(Object.prototype);
  });
});

describe('withKey, renameKey and moveItem', () => {
  it('keep the order of what they don’t move', () => {
    expect(Object.keys(withKey({ a: 1, c: 3 }, 'b', 2, ['a', 'b', 'c']))).toEqual(['a', 'b', 'c']);
    expect(Object.keys(withKey({ c: 3 }, 'a', 1, ['a', 'b', 'c']))).toEqual(['a', 'c']);
    expect(renameKey({ a: 1, b: 2, c: 3 }, 'b', 'x')).toEqual({ a: 1, x: 2, c: 3 });
    expect(Object.keys(renameKey({ a: 1, b: 2, c: 3 }, 'b', 'x') ?? {})).toEqual(['a', 'x', 'c']);
    expect(renameKey({ a: 1, b: 2 }, 'a', 'b')).toBeNull();
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
  });
});

describe('numbers typed and slid', () => {
  it.each([
    ['12', 12],
    [' -4.5 ', -4.5],
    ['.5', 0.5],
    ['1.', 1],
    ['1e3', 1000],
    ['+7', 7],
  ])('reads %j as %j', (text, n) => {
    expect(parseNumber(text)).toBe(n);
  });

  it.each(['', '-', '1e', '12a', '0x10', 'Infinity', '1,5', '1e999'])('reads %j as not a number yet', (text) => {
    expect(parseNumber(text)).toBeNull();
  });

  it('steps a slider by a round hundredth of its range, by 1 at least for whole numbers', () => {
    expect(sliderStep(0, 1, false)).toBe(0.01);
    expect(sliderStep(0, 100, false)).toBe(1);
    expect(sliderStep(0, 20, false)).toBe(0.1);
    expect(sliderStep(0, 1, true)).toBe(1);
    expect(sliderStep(5, 5, false)).toBe(1);
    expect(roundToStep(0.1 + 0.2, 0.01)).toBe(0.3);
    expect(roundToStep(72.4, 1)).toBe(72);
  });
});

describe('the keyboard a number field asks a phone for', () => {
  it('is digits for whole numbers that can’t go below zero, with a point for others, and full when negative', () => {
    expect(inputMode({ kind: 'int', min: 0 })).toBe('numeric');
    expect(inputMode({ kind: 'number', min: 0 })).toBe('decimal');
    // iOS's number pads have no minus key (WebKit bug 193825).
    expect(inputMode({ kind: 'int', min: -5 })).toBe('text');
    expect(inputMode({ kind: 'number' })).toBe('text');
  });
});
