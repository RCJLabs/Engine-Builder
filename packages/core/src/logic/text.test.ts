import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../test/logic-catalog.ts';
import {
  type Condition,
  checkCondition,
  FACT_PATTERN,
  isPrintableNumber,
  OPS,
  parseCondition,
  printCondition,
} from './index.ts';

const parsed = (text: string, withCatalog = true) => {
  const result = parseCondition(text, withCatalog ? catalog : undefined);
  if (!result.ok) throw new Error(`${result.message}`);
  return result.condition;
};
const failure = (text: string) => {
  const result = parseCondition(text, catalog);
  return result.ok ? 'parsed' : { message: result.message, at: result.at };
};

// Trees of every shape, with awkward values: any printable double, any UTF-16 string.
const value = fc.oneof(
  fc.double({ noNaN: true, noDefaultInfinity: true }).filter(isPrintableNumber),
  fc.integer({ min: -1000, max: 1000 }),
  fc.string({ unit: 'binary', maxLength: 8 }),
  fc.constantFrom('medkit', 'dead-hauler', 'and', 'true', '2', 'a.b'),
  fc.boolean(),
);
const name = fc.stringMatching(/^[a-z][a-z0-9]{0,4}(-[a-z0-9]{1,3})?$/);
const fact = fc.oneof(fc.constantFrom(...Object.keys(catalog)), fc.stringMatching(FACT_PATTERN));
const test = fc
  .record({
    fact,
    args: fc.option(fc.dictionary(name, value, { minKeys: 1, maxKeys: 3 }), { nil: undefined }),
    compare: fc.option(fc.tuple(fc.constantFrom(...OPS), value), { nil: undefined }),
  })
  .map(({ fact, args, compare }) => ({
    fact,
    ...(args ? { args } : {}),
    ...(compare ? { op: compare[0], value: compare[1] } : {}),
  }));
const tree: fc.Arbitrary<Condition> = fc.letrec<{ cond: Condition }>((tie) => ({
  cond: fc.oneof(
    { depthSize: 'small' },
    test,
    fc.array(tie('cond'), { minLength: 2, maxLength: 3 }).map((all) => ({ all })),
    fc.array(tie('cond'), { minLength: 2, maxLength: 3 }).map((any) => ({ any })),
    tie('cond').map((not) => ({ not })),
  ),
})).cond;

describe('text form round trip', () => {
  it('reads every printed tree back as the same tree, with or without a catalog', () => {
    fc.assert(
      fc.property(tree, (condition) => {
        expect(checkCondition(condition)).toEqual([]);
        expect(parsed(printCondition(condition, catalog))).toEqual(condition);
        expect(parsed(printCondition(condition), false)).toEqual(condition);
      }),
      { numRuns: 500 },
    );
  });

  it('prints the canonical form of text that reads', () => {
    for (const [text, canonical] of [
      ['hold.count(medkit)>=2 and\n  not voyage.night', 'hold.count(medkit) >= 2 and not voyage.night'],
      ['a.x or b.y and c.z', 'a.x or (b.y and c.z)'],
      ['(a.x)', 'a.x'],
      ['crew.trait(trait: brave, member: rook)', 'crew.trait(member: rook, trait: brave)'],
      ['hold.count(item: medkit) > 0', 'hold.count(medkit) > 0'],
      [
        'voyage.leader == "Big Gun" or x.y == "true" or x.y != -0.50',
        'voyage.leader == "Big Gun" or x.y == "true" or x.y != -0.5',
      ],
    ]) {
      expect(printCondition(parsed(text as string), catalog)).toBe(canonical);
    }
  });
});

describe('parseCondition', () => {
  it('binds or loosest, then and, then not, then a comparison', () => {
    expect(parsed('a.x or b.y and not c.z >= 2')).toEqual({
      any: [{ fact: 'a.x' }, { all: [{ fact: 'b.y' }, { not: { fact: 'c.z', op: '>=', value: 2 } }] }],
    });
  });

  it('keeps a bracketed group as its own node', () => {
    expect(parsed('(a.x and b.y) and c.z')).toEqual({
      all: [{ all: [{ fact: 'a.x' }, { fact: 'b.y' }] }, { fact: 'c.z' }],
    });
    expect(parsed('a.x and b.y and c.z')).toEqual({ all: [{ fact: 'a.x' }, { fact: 'b.y' }, { fact: 'c.z' }] });
  });

  it('names a lone argument from the catalog, and asks for the name without one', () => {
    expect(parsed('hold.count(medkit) >= 2')).toEqual({
      fact: 'hold.count',
      args: { item: 'medkit' },
      op: '>=',
      value: 2,
    });
    expect(parseCondition('hold.count(medkit) >= 2')).toMatchObject({ ok: false, at: 10 });
  });

  it.each([
    ['hold.count(medkit) >= 2 && voyage.night', 'Unexpected "&": write "and"', 24],
    ['voyage.night || x.y', 'Unexpected "|": write "or"', 13],
    ['!voyage.night', 'Unexpected "!": write "not"', 0],
    ['voyage.sector = rim', 'Unexpected "=": compare with "=="', 14],
    ['Voyage.night', 'Unexpected "V": names are lowercase, like hold.count', 0],
    ["voyage.sector == 'rim'", 'Unexpected "\'": text goes in double quotes', 17],
    [
      'hold.credits > 1e5',
      'Unexpected "1": numbers have no exponent or letters; quote text that starts with a digit',
      15,
    ],
    ['voyage.sector == "rim', 'Text that never ends', 17],
    ['hold.count(medkit) >=', 'Expected a value to compare with, but the text ended', 21],
    ['(voyage.night', 'Expected ")", but the text ended', 13],
    ['voyage.night and', 'Expected a fact, like hold.count, but the text ended', 16],
    ['voyage', 'Expected a fact, like hold.count', 0],
    ['voyage.night voyage.night', 'Expected "and", "or" or the end', 13],
    ['x.y()', 'A fact with no arguments has no brackets', 4],
    ['x.y(a: 1, a: 2)', '"a" is given twice', 10],
    ['x.y(1, 2)', 'Expected ")": name each argument when there is more than one', 5],
    ['x.y == a.b', 'Expected a value to compare with; text with a dot goes in quotes', 7],
    ['x.y == and', 'Expected a value to compare with', 7],
    ['crew.hp(@) > 1', 'Unexpected "@": a slot is @ and its name, like @mark', 8],
    ['crew.hp(@Mark) > 1', 'Unexpected "@": a slot is @ and its name, like @mark', 8],
  ])('reports %j with its column', (text, message, at) => {
    expect(failure(text)).toEqual({ message: `${message} (column ${at + 1})`, at });
  });
});

describe('a slot (M3.10)', () => {
  it('reads as the text "@mark", bare or in quotes, and prints bare', () => {
    const tree: Condition = { fact: 'crew.hp', args: { member: '@mark' }, op: '>', value: 2 };
    expect(parsed('crew.hp(@mark) > 2')).toEqual(tree);
    expect(parsed('crew.hp("@mark") > 2')).toEqual(tree);
    expect(printCondition(tree, catalog)).toBe('crew.hp(@mark) > 2');
    expect(printCondition({ fact: 'voyage.leader', op: '==', value: '@the-mark' })).toBe('voyage.leader == @the-mark');
  });

  it('ends where its name does', () => {
    expect(parsed('crew.trait(member: @mark, trait: brave)')).toEqual({
      fact: 'crew.trait',
      args: { member: '@mark', trait: 'brave' },
    });
  });
});
