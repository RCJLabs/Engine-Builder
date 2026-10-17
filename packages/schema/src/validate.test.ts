import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { actor, item, lootTable, sampleTypes } from '../test/samples.ts';
import { DIAGNOSTIC_CODES, type Diagnostic, defineRecordType, type RecordInput, validateRecords, z } from './index.ts';

/** A small valid project: every reference resolves. */
const project = (): RecordInput[] => [
  { type: 'item', id: 'medkit', file: 'records/item/medkit.json', value: { name: 'Medkit', weight: 1 } },
  { type: 'item', id: 'salvage', file: 'records/item/salvage.json', value: { name: 'Salvage', weight: 3 } },
  {
    type: 'actor',
    id: 'rook',
    file: 'records/actor/rook.json',
    value: { name: 'Rook', carries: { medkit: 2 }, drops: 'dead-hauler', hands: [null, 'salvage'] },
  },
  {
    type: 'loot-table',
    id: 'dead-hauler',
    file: 'records/loot-table/dead-hauler.json',
    value: {
      rolls: [1, 2],
      entries: [
        { item: 'salvage', weight: 3 },
        { item: 'medkit', weight: 1 },
      ],
      when: { all: [{ flag: 'met-rook' }, { has: 'medkit' }] },
      effects: [
        { op: 'spawn', actor: 'rook' },
        { op: 'mark', target: 'item:salvage' },
      ],
    },
  },
];

/** The project with one record's value replaced. */
function withValue(type: string, id: string, value: unknown): RecordInput[] {
  return project().map((record) => (record.type === type && record.id === id ? { ...record, value } : record));
}

const rook = (changes: Record<string, unknown>) => ({ name: 'Rook', ...changes });
const table = (changes: Record<string, unknown>) => ({ rolls: [1, 2], entries: [], ...changes });

/** Just the parts a test asserts on. */
const brief = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.map(({ code, path, message }) => ({ code, path, message }));

describe('a valid project', () => {
  it('has no diagnostics', () => {
    expect(validateRecords(sampleTypes, project()).diagnostics).toEqual([]);
  });

  it('finds references in record keys, tuples, arrays, lazy unions and discriminated unions', () => {
    const { usedBy } = validateRecords(sampleTypes, project());
    const rookFile = 'records/actor/rook.json';
    const tableFile = 'records/loot-table/dead-hauler.json';
    expect([...usedBy]).toEqual([
      ['actor:rook', [{ from: 'loot-table:dead-hauler', file: tableFile, path: '/effects/0/actor' }]],
      [
        'item:medkit',
        [
          { from: 'actor:rook', file: rookFile, path: '/carries/medkit' },
          { from: 'loot-table:dead-hauler', file: tableFile, path: '/entries/1/item' },
          { from: 'loot-table:dead-hauler', file: tableFile, path: '/when/all/1/has' },
        ],
      ],
      [
        'item:salvage',
        [
          { from: 'actor:rook', file: rookFile, path: '/hands/1' },
          { from: 'loot-table:dead-hauler', file: tableFile, path: '/effects/1/target' },
          { from: 'loot-table:dead-hauler', file: tableFile, path: '/entries/0/item' },
        ],
      ],
      ['loot-table:dead-hauler', [{ from: 'actor:rook', file: rookFile, path: '/drops' }]],
    ]);
  });
});

describe('E001: the record does not match its schema', () => {
  it('reports a wrong type deep in an array, at its path', () => {
    const records = withValue('loot-table', 'dead-hauler', table({ entries: [{ item: 'medkit', weight: 'heavy' }] }));
    expect(brief(validateRecords(sampleTypes, records).diagnostics)).toEqual([
      { code: 'E001', path: '/entries/0/weight', message: 'Invalid input: expected number, received string' },
    ]);
  });

  it('reports each unknown field at its own path, escaped', () => {
    const records = withValue('item', 'medkit', { name: 'Medkit', weight: 1, wieght: 2, 'a/b~c': true });
    expect(brief(validateRecords(sampleTypes, records).diagnostics)).toEqual([
      { code: 'E001', path: '/a~1b~0c', message: 'Unknown field "a/b~c"' },
      { code: 'E001', path: '/wieght', message: 'Unknown field "wieght"' },
    ]);
  });

  it('escapes keys in the paths zod reports', () => {
    const note = defineRecordType({
      type: 'note',
      title: 'Note',
      description: '',
      schema: z.strictObject({ counts: z.record(z.string(), z.int()) }),
    });
    const records = [{ type: 'note', id: 'tally', value: { counts: { 'hp/max~now': 'ten' } } }];
    expect(brief(validateRecords([note], records).diagnostics)).toEqual([
      { code: 'E001', path: '/counts/hp~1max~0now', message: 'Invalid input: expected number, received string' },
    ]);
  });

  it('reports a missing field by name', () => {
    const records = withValue('item', 'medkit', { weight: 1 });
    expect(brief(validateRecords(sampleTypes, records).diagnostics)).toEqual([
      { code: 'E001', path: '/name', message: 'Missing field "name"' },
    ]);
  });

  it('reports a bad discriminator, a bad record key and a record that is not an object', () => {
    const records = [
      ...withValue('actor', 'rook', rook({ carries: { Medkit: 1 } })),
      { type: 'loot-table', id: 'empty', value: table({ effects: [{ op: 'take' }] }) },
      { type: 'item', id: 'odd', value: 5 },
    ];
    expect(brief(validateRecords(sampleTypes, records).diagnostics)).toEqual([
      { code: 'E001', path: '', message: 'Invalid input: expected object, received number' },
      {
        code: 'E001',
        path: '/effects/0/op',
        message: "Invalid discriminator value. Expected 'give' | 'spawn' | 'mark'",
      },
      {
        code: 'E001',
        path: '/carries/Medkit',
        message: 'Invalid key: Not a valid item id: use lowercase words joined by hyphens',
      },
    ]);
  });

  it('reports a malformed reference once, as E001 only', () => {
    const records = withValue('actor', 'rook', rook({ drops: 'Dead Hauler' }));
    expect(brief(validateRecords(sampleTypes, records).diagnostics)).toEqual([
      { code: 'E001', path: '/drops', message: 'Not a valid loot-table id: use lowercase words joined by hyphens' },
    ]);
  });
});

describe('record-level checks', () => {
  it('E002: an unknown type, checked no further', () => {
    const records = [...project(), { type: 'weapon', id: 'Laser', value: { nonsense: true } }];
    expect(brief(validateRecords(sampleTypes, records).diagnostics)).toEqual([
      { code: 'E002', path: '', message: 'Unknown record type "weapon"' },
    ]);
  });

  it('E003: an invalid id, with the value still checked', () => {
    const records = [...project(), { type: 'item', id: 'Big Gun', value: { name: 'Big Gun' } }];
    expect(brief(validateRecords(sampleTypes, records).diagnostics)).toEqual([
      {
        code: 'E003',
        path: '',
        message: '"Big Gun" is not a valid id: use lowercase words joined by hyphens, at most 64 characters',
      },
      { code: 'E001', path: '/weight', message: 'Missing field "weight"' },
    ]);
  });

  it('E004: a duplicate id, reported on every copy with its file', () => {
    const records = [
      ...project(),
      { type: 'item', id: 'medkit', file: 'records/item/medkit-2.json', value: { name: 'Medkit', weight: 1 } },
      { type: 'actor', id: 'medkit', file: 'records/actor/medkit.json', value: { name: 'Not a duplicate' } },
    ];
    const { diagnostics } = validateRecords(sampleTypes, records);
    expect(diagnostics.map(({ code, file, type, id }) => ({ code, file, type, id }))).toEqual([
      { code: 'E004', file: 'records/item/medkit-2.json', type: 'item', id: 'medkit' },
      { code: 'E004', file: 'records/item/medkit.json', type: 'item', id: 'medkit' },
    ]);
    expect(diagnostics[0]?.message).toBe('2 item records have the id "medkit"');
  });
});

describe('references', () => {
  it('E005: a reference to a missing record, in each kind of place', () => {
    const records = [
      ...withValue('actor', 'rook', rook({ carries: { ghost: 1 }, drops: 'nowhere', hands: ['ghost', null] })),
      {
        type: 'loot-table',
        id: 'empty',
        value: table({ when: { all: [{ has: 'ghost' }] }, effects: [{ op: 'mark', target: 'actor:nobody' }] }),
      },
    ];
    // Sorted by file first: the loot table has none, so it comes before rook's file.
    expect(brief(validateRecords(sampleTypes, records).diagnostics)).toEqual([
      { code: 'E005', path: '/effects/0/target', message: 'No record actor:nobody' },
      { code: 'E005', path: '/when/all/0/has', message: 'No record item:ghost' },
      { code: 'E005', path: '/carries/ghost', message: 'No record item:ghost' },
      { code: 'E005', path: '/drops', message: 'No record loot-table:nowhere' },
      { code: 'E005', path: '/hands/0', message: 'No record item:ghost' },
    ]);
  });

  it('E006: a qualified reference to a type the field does not allow', () => {
    const records = [
      ...project(),
      {
        type: 'loot-table',
        id: 'empty',
        value: table({ effects: [{ op: 'mark', target: 'loot-table:dead-hauler' }] }),
      },
    ];
    expect(brief(validateRecords(sampleTypes, records).diagnostics)).toEqual([
      { code: 'E006', path: '/effects/0/target', message: 'This field takes actor or item records, not loot-table' },
    ]);
  });

  it('still checks the references in a discriminated union option that fails elsewhere', () => {
    const records = [
      ...project(),
      { type: 'loot-table', id: 'empty', value: table({ effects: [{ op: 'give', item: 'ghost', count: 0 }] }) },
    ];
    expect(brief(validateRecords(sampleTypes, records).diagnostics)).toEqual([
      { code: 'E001', path: '/effects/0/count', message: 'Too small: expected number to be >=1' },
      { code: 'E005', path: '/effects/0/item', message: 'No record item:ghost' },
    ]);
  });

  it('counts an unreadable record as existing, without checking its value', () => {
    const records = project().map((record) =>
      record.id === 'dead-hauler' ? { ...record, value: undefined, unreadable: true } : record,
    );
    const { diagnostics, usedBy } = validateRecords(sampleTypes, records);
    expect(diagnostics).toEqual([]);
    expect(usedBy.get('loot-table:dead-hauler')).toHaveLength(1);
    expect(usedBy.has('actor:rook')).toBe(false);
  });

  it('lists references to missing records in usedBy, so deletions can be traced', () => {
    const records = withValue('actor', 'rook', rook({ drops: 'nowhere' }));
    expect(validateRecords(sampleTypes, records).usedBy.get('loot-table:nowhere')).toEqual([
      { from: 'actor:rook', file: 'records/actor/rook.json', path: '/drops' },
    ]);
  });
});

describe('the code table', () => {
  // The compiler's tests cover the codes for files and project.json (E007 and up).
  it('fires every code validation owns, all of them errors', () => {
    const records: RecordInput[] = [
      ...withValue('actor', 'rook', rook({ drops: 'nowhere', weight: 1 })),
      { type: 'weapon', id: 'laser', value: {} },
      { type: 'item', id: 'Bad Id', value: { name: 'x', weight: 1 } },
      { type: 'item', id: 'medkit', value: { name: 'Medkit', weight: 1 } },
      { type: 'loot-table', id: 'empty', value: table({ effects: [{ op: 'mark', target: 'loot-table:empty' }] }) },
    ];
    const { diagnostics } = validateRecords(sampleTypes, records);
    const owned = Object.keys(DIAGNOSTIC_CODES).filter((code) => code <= 'E006');
    expect(owned).toEqual(['E001', 'E002', 'E003', 'E004', 'E005', 'E006']);
    expect([...new Set(diagnostics.map((d) => d.code))].sort()).toEqual(owned);
    expect(new Set(diagnostics.map((d) => d.severity))).toEqual(new Set(['error']));
  });
});

describe('programmer errors', () => {
  it('throws when a type references a type that is not given', () => {
    expect(() => validateRecords([item, actor], [])).toThrow(
      'Record type "actor" references unknown type "loot-table"',
    );
  });

  it('throws when two types share a name', () => {
    expect(() => validateRecords([item, item, actor, lootTable], [])).toThrow('Two record types are named "item"');
  });
});

describe('order', () => {
  // Valid and broken records together, including same-key duplicates without files, whose
  // relative order only the sort can fix.
  const mixed = (): RecordInput[] => [
    ...withValue('actor', 'rook', rook({ carries: { ghost: 1, medkit: 1 }, drops: 'nowhere', extra: 1 })),
    { type: 'item', id: 'medkit', value: { name: 'Copy', weight: -1 } },
    { type: 'item', id: 'medkit', value: { name: '', weight: 1 } },
    { type: 'weapon', id: 'laser', value: {} },
    { type: 'item', id: 'Bad Id', value: { weight: 'x' } },
    {
      type: 'loot-table',
      id: 'empty',
      value: table({
        effects: [
          { op: 'mark', target: 'loot-table:empty' },
          { op: 'give', item: 'medkit', count: 1 },
        ],
      }),
    },
  ];

  it('gives the same diagnostics and usedBy however the records are ordered', () => {
    const records = mixed();
    const expected = validateRecords(sampleTypes, records);
    expect(expected.diagnostics.length).toBeGreaterThan(10);
    fc.assert(
      fc.property(fc.shuffledSubarray(records, { minLength: records.length }), (shuffled) => {
        const result = validateRecords(sampleTypes, shuffled);
        expect(result.diagnostics).toEqual(expected.diagnostics);
        expect([...result.usedBy]).toEqual([...expected.usedBy]);
      }),
    );
  });
});
