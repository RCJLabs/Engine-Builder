import { checkCondition, FACT_PATTERN, OPS } from '@eb/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { event as eventType, eventTypes, facts } from '../test/events.ts';
import { condition, defineRecordType, type RecordInput, recordJsonSchema, validateRecords, z } from './index.ts';

const base: RecordInput[] = [
  { type: 'item', id: 'medkit', value: { name: 'Medkit', weight: 1 } },
  { type: 'actor', id: 'kit', value: { name: 'Kit' } },
  { type: 'actor', id: 'mara', value: { name: 'Mara' } },
];
const roll = (...chances: number[]) => ({
  effect: 'roll',
  outcomes: chances.map((chance) => ({ chance, effects: [] })),
});
const event = (when: unknown, effects: unknown[] = []) => ({
  choices: { go: when === undefined ? { effects } : { when, effects } },
});
const run = (value: unknown, withFacts = true) =>
  validateRecords(eventTypes, [...base, { type: 'event', id: 'derelict', value }], withFacts ? { facts } : {});
const lines = (value: unknown, withFacts = true) =>
  run(value, withFacts).diagnostics.map(({ code, path, message }) => `${code} ${path}: ${message}`);

describe('conditions in records', () => {
  it('accepts sound conditions and rolls, and lists the records they name', () => {
    const value = {
      when: { not: { fact: 'voyage.night' } },
      choices: {
        board: {
          when: { fact: 'hold.count', args: { item: 'medkit' }, op: '>=', value: 1 },
          effects: [
            {
              effect: 'roll',
              outcomes: [
                { chance: 70, effects: [{ effect: 'give', item: 'medkit' }] },
                { chance: 30, effects: [] },
              ],
            },
          ],
        },
        hail: { when: { fact: 'voyage.leader', op: '==', value: 'kit' }, effects: [] },
      },
    };
    const { diagnostics, usedBy } = run(value);
    expect(diagnostics).toEqual([]);
    expect(usedBy.get('item:medkit')?.map((u) => u.path)).toEqual([
      '/choices/board/effects/0/outcomes/0/effects/0/item',
      '/choices/board/when/args/item',
    ]);
    expect(usedBy.get('actor:kit')).toEqual([{ from: 'event:derelict', path: '/choices/hail/when/value' }]);
  });

  it('lints against the records there are: with kit the only actor, the leader is always kit', () => {
    const records = [
      ...base.slice(0, 2),
      { type: 'event', id: 'derelict', value: event({ fact: 'voyage.leader', op: '==', value: 'kit' }) },
    ];
    expect(validateRecords(eventTypes, records, { facts }).diagnostics.map((d) => d.code)).toEqual(['W103']);
  });

  it.each([
    [
      'a group of one',
      { all: [{ fact: 'voyage.night' }] },
      'E011 /choices/go/when/all: all takes a list of two or more conditions',
    ],
    ['an unknown field', { fact: 'voyage.night', why: 1 }, 'E011 /choices/go/when/why: Unknown field "why"'],
    [
      'an op without a value',
      { fact: 'voyage.night', op: '==' },
      'E011 /choices/go/when: op and value go together: both, or neither for a yes/no fact',
    ],
    ['a number', 3, 'E011 /choices/go/when: A condition is an object with all, any, not or fact'],
    ['an unknown fact', { fact: 'voyage.storm' }, 'E012 /choices/go/when/fact: No fact "voyage.storm"'],
    [
      'a record that does not exist',
      { fact: 'hold.count', args: { item: 'ghost' }, op: '>', value: 0 },
      'E013 /choices/go/when/args/item: No item record "ghost"',
    ],
    [
      'a leader nobody is',
      { fact: 'voyage.leader', op: '==', value: 'ghost' },
      'E014 /choices/go/when/value: No actor record "ghost"',
    ],
    [
      'a test that is never true',
      { fact: 'hold.credits', op: '<', value: 0 },
      'W102 /choices/go/when: This condition is never true, whatever its facts hold',
    ],
    [
      'a test that is never false',
      { fact: 'hold.credits', op: '>=', value: 0 },
      'W103 /choices/go/when: This condition is never false: it holds whenever its facts have values',
    ],
  ])('reports %s once, with the condition checker’s words rather than zod’s', (_name, when, expected) => {
    expect(lines(event(when))).toEqual([expected]);
  });

  it('says so when a sample could not find a way to be true', () => {
    const slots = Array.from({ length: 9 }, (_, i) => ({ fact: 'hold.slot', args: { i }, op: '>', value: 50 }));
    expect(lines(event({ all: [...slots, { fact: 'hold.slot', args: { i: 0 }, op: '<', value: 10 }] }))).toEqual([
      'W104 /choices/go/when: Could not tell whether this condition can be true: none of 20000 samples of its 3125000 combinations was',
    ]);
  });

  it('checks only the shape, and lints facts as having no domain, without a catalog', () => {
    expect(lines(event({ fact: 'voyage.storm' }), false)).toEqual([]);
    expect(lines(event({ all: [{ fact: 'voyage.storm' }, { not: { fact: 'voyage.storm' } }] }), false)).toEqual([
      'W102 /choices/go/when: This condition is never true, whatever its facts hold',
    ]);
  });

  it("checks a roll's chances add up to 100", () => {
    expect(lines(event(undefined, [roll(60, 30)]))).toEqual([
      "E001 /choices/go/effects/0/outcomes: A roll's chances add up to 100",
    ]);
    expect(lines(event(undefined, [roll(100, 0)]))).toEqual([
      'E001 /choices/go/effects/0/outcomes/1/chance: Too small: expected number to be >=1',
    ]);
  });

  it('gives the same diagnostics whatever order the records come in', () => {
    const records: RecordInput[] = [
      ...base,
      { type: 'actor', id: 'rook', value: { name: 'Rook' } },
      { type: 'event', id: 'a', value: event({ fact: 'voyage.leader', op: '!=', value: 'kit' }) },
      { type: 'event', id: 'b', value: event({ fact: 'hold.count', args: { item: 'ghost' }, op: '<', value: 0 }) },
    ];
    const once = validateRecords(eventTypes, records, { facts });
    expect(validateRecords(eventTypes, [...records].reverse(), { facts })).toEqual(once);
  });

  it('exports conditions to JSON Schema once, marked for the editor', () => {
    const schema = recordJsonSchema(eventType) as {
      properties: { when: unknown; choices: { additionalProperties: { properties: { when: unknown } } } };
      $defs: Record<string, Record<string, unknown>>;
    };
    expect(schema.properties.when).toEqual({ $ref: '#/$defs/eb-condition' });
    expect(schema.properties.choices.additionalProperties.properties.when).toEqual({
      description: 'Offered only while this holds',
      $ref: '#/$defs/eb-condition',
    });
    expect(schema.$defs['eb-condition']?.['x-eb-condition']).toBe(true);
  });
});

describe('conditions written as text (D31)', () => {
  it('check like trees, with problems and references at the field, which has no places inside', () => {
    expect(lines(event('hold.count(ghost) > 0'))).toEqual(['E013 /choices/go/when: No item record "ghost"']);
    const { diagnostics, usedBy } = run(event('hold.count(medkit) >= 1 and voyage.leader == kit'));
    expect(diagnostics).toEqual([]);
    expect(usedBy.get('item:medkit')).toEqual([{ from: 'event:derelict', path: '/choices/go/when' }]);
    expect(usedBy.get('actor:kit')).toEqual([{ from: 'event:derelict', path: '/choices/go/when' }]);
  });

  it('report text that does not parse once, in the parser’s words, with its column', () => {
    expect(lines(event('hold.count(medkit) >='))).toEqual([
      'E011 /choices/go/when: Expected a value to compare with, but the text ended (column 22)',
    ]);
    expect(lines(event('voyage.night && voyage.leader == kit'))).toEqual([
      'E011 /choices/go/when: Unexpected "&": write "and" (column 14)',
    ]);
  });

  it('take a fact’s one argument by itself only when the facts are known', () => {
    expect(lines(event('hold.count(medkit) >= 1'), false)).toEqual([
      'E011 /choices/go/when: Name the argument, like hold.count(name: …) (column 11)',
    ]);
    expect(lines(event('hold.count(item: medkit) >= 1'), false)).toEqual([]);
  });

  it('lint like trees', () => {
    expect(lines(event('voyage.night and not voyage.night'))).toEqual([
      'W102 /choices/go/when: This condition is never true, whatever its facts hold',
    ]);
  });

  it('are found inside a union option, since text lets the option parse', () => {
    const gate = defineRecordType({
      type: 'gate',
      title: 'Gate',
      description: 'Opens when its condition holds.',
      schema: z.strictObject({
        rule: z.union([z.strictObject({ when: condition() }), z.strictObject({ always: z.literal(true) })]),
      }),
    });
    const found = validateRecords(
      [...eventTypes, gate],
      [...base, { type: 'gate', id: 'g', value: { rule: { when: 'voyage.storm' } } }],
      { facts },
    );
    expect(found.diagnostics.map(({ code, path }) => `${code} ${path}`)).toEqual(['E012 /rule/when']);
  });
});

describe('the condition schema', () => {
  // Sound trees, with a few leaves that each break one rule: a bad name, -0, an exponent, empty
  // args, op without value, value without op, an extra key. Groups of one or none, mixed kinds
  // and stray JSON now and then.
  const good = fc.oneof(fc.integer(), fc.string({ maxLength: 3 }), fc.boolean(), fc.constant(0.5));
  const name = fc.stringMatching(/^[a-z][a-z0-9]{0,3}$/);
  const sound = fc
    .record(
      {
        fact: fc.stringMatching(FACT_PATTERN),
        args: fc.dictionary(name, good, { minKeys: 1, maxKeys: 2 }),
        compare: fc.tuple(fc.constantFrom(...OPS), good),
      },
      { requiredKeys: ['fact'] },
    )
    .map(({ fact, args, compare }) => ({
      fact,
      ...(args ? { args } : {}),
      ...(compare ? { op: compare[0], value: compare[1] } : {}),
    }));
  type Test = Record<string, unknown>;
  const breaks: fc.Arbitrary<(t: Test) => Test> = fc.oneof(
    fc.constant((t: Test) => ({ ...t, extra: 1 })),
    fc.constantFrom('night', 'A.b', 'a.b.c', 3).map((fact) => (t: Test) => ({ ...t, fact })),
    fc.constantFrom(-0, 1e21, null, [], {}).map((value) => (t: Test) => ({ ...t, op: '==', value })),
    fc.constantFrom(-0, 1e21, null).map((arg) => (t: Test) => ({ ...t, args: { n: arg } })),
    fc.constantFrom('Item', '1x', 'a-').map((arg) => (t: Test) => ({ ...t, args: { [arg]: 1 } })),
    fc.constant((t: Test) => ({ ...t, args: {} })),
    fc.constantFrom('=', '<>').map((op) => (t: Test) => ({ ...t, op, value: 1 })),
    fc.constant(({ value: _, ...t }: Test) => ({ ...t, op: '==' })),
    fc.constant(({ op: _, ...t }: Test) => ({ ...t, value: 1 })),
  );
  const broken = fc.tuple(sound, breaks).map(([t, breakIt]) => breakIt(t));
  const near: fc.Arbitrary<unknown> = fc.letrec<{ cond: unknown }>((tie) => ({
    cond: fc.oneof(
      { depthSize: 'small' },
      { arbitrary: sound, weight: 8 },
      { arbitrary: broken, weight: 1 },
      { arbitrary: fc.array(tie('cond'), { minLength: 2, maxLength: 3 }).map((all) => ({ all })), weight: 3 },
      { arbitrary: fc.array(tie('cond'), { minLength: 2, maxLength: 3 }).map((any) => ({ any })), weight: 3 },
      { arbitrary: tie('cond').map((not) => ({ not })), weight: 2 },
      { arbitrary: fc.array(tie('cond'), { maxLength: 1 }).map((all) => ({ all })), weight: 1 },
      { arbitrary: fc.tuple(tie('cond'), sound).map(([not, t]) => ({ not, ...t })), weight: 1 },
      { arbitrary: fc.jsonValue({ maxDepth: 2 }), weight: 1 },
    ),
  })).cond;

  it('accepts exactly what checkCondition finds sound, over a mix of both, and any text', () => {
    let accepted = 0;
    fc.assert(
      fc.property(near, (candidate) => {
        const ok = checkCondition(candidate).length === 0;
        if (ok) accepted++;
        // Text is the condition's other form (D31): the schema takes any, and validation parses it.
        expect(z.safeParse(condition(), candidate).success).toBe(ok || typeof candidate === 'string');
      }),
      { numRuns: 2000 },
    );
    // Both sides of the property are tried often.
    expect(accepted).toBeGreaterThan(400);
    expect(accepted).toBeLessThan(1600);
  });
});
