import { describe, expect, it } from 'vitest';
import { type RecordInput, recordJsonSchema, type TypeFile, typeFromFile, validateRecords } from './index.ts';

const school = typeFromFile('school', { title: 'School', fields: { name: { kind: 'text', min: 1 } } });
const weapon = typeFromFile('weapon', { title: 'Weapon', fields: { name: { kind: 'text' } } });
const gladiatorFile: TypeFile = {
  title: 'Gladiator',
  description: 'A fighter of the arena.',
  fields: {
    name: { kind: 'text', min: 1, max: 12 },
    might: { kind: 'int', min: 0, max: 100 },
    weight: { kind: 'number', min: 40.5, optional: true },
    style: { kind: 'enum', values: ['retiarius', 'murmillo'] },
    school: { kind: 'ref', to: 'school', label: 'Trained at' },
    rival: { kind: 'ref', to: ['gladiator', 'school'], optional: true },
    free: { kind: 'bool' },
    skills: { kind: 'list', of: { kind: 'text', min: 1 }, max: 2 },
    kit: { kind: 'map', key: { kind: 'ref', to: 'weapon' }, of: { kind: 'int', min: 1 }, optional: true },
    stats: { kind: 'map', key: { kind: 'enum', values: ['str', 'dex'] }, of: { kind: 'number' }, optional: true },
    notes: { kind: 'map', of: { kind: 'text' }, optional: true },
    record: { kind: 'group', fields: { wins: { kind: 'int', min: 0 } }, optional: true },
    colour: { kind: 'colour', optional: true },
    portrait: { kind: 'asset', of: 'image', optional: true, description: 'Shown on the roster' },
    fights: { kind: 'condition', optional: true },
    deeds: { kind: 'effects', optional: true },
  },
};
const gladiator = typeFromFile('gladiator', gladiatorFile);
const types = [school, weapon, gladiator].map((t) => t.recordType);

const base: RecordInput[] = [
  { type: 'school', id: 'ludus-magnus', value: { name: 'Ludus Magnus' } },
  { type: 'weapon', id: 'trident', value: { name: 'Trident' } },
];
const spiculus = {
  name: 'Spiculus',
  might: 72,
  style: 'murmillo',
  school: 'ludus-magnus',
  free: false,
  skills: ['feint'],
};
const lines = (value: unknown, assets?: ReadonlySet<string>) =>
  validateRecords(
    types,
    [...base, { type: 'gladiator', id: 'spiculus', value }],
    assets ? { assets } : {},
  ).diagnostics.map(({ code, path, message }) => `${code} ${path}: ${message}`);

describe('typeFromFile', () => {
  it('builds a record type with the targets its refs name', () => {
    expect(gladiator.recordType.type).toBe('gladiator');
    expect(gladiator.recordType.title).toBe('Gladiator');
    expect(gladiator.recordType.targets).toEqual(['gladiator', 'school', 'weapon']);
    expect(lines(spiculus)).toEqual([]);
  });

  it.each([
    ['empty text with a min of 1', { name: '' }, 'E001 /name: Write something here'],
    ['text past its max', { name: 'Spiculus the Great' }, 'E001 /name: At most 12 characters'],
    ['text that is not text', { name: 7 }, 'E001 /name: Expected text'],
    ['a fraction for an int', { might: 7.5 }, 'E001 /might: Expected a whole number'],
    ['an int past its max', { might: 101 }, 'E001 /might: At most 100'],
    ['a number below its min', { weight: 40 }, 'E001 /weight: At least 40.5'],
    ['a value not in the enum', { style: 'thraex' }, 'E001 /style: Expected one of: retiarius, murmillo'],
    ['a bool as text', { free: 'no' }, 'E001 /free: Expected true or false'],
    ['a ref to nothing', { school: 'ludus-dacicus' }, 'E005 /school: No record school:ludus-dacicus'],
    ['a ref left empty', { school: '' }, 'E001 /school: No school chosen yet'],
    [
      'a qualified ref to a type the field does not take',
      { rival: 'weapon:trident' },
      'E006 /rival: This field takes gladiator or school records, not weapon',
    ],
    ['too many list items', { skills: ['a', 'b', 'c'] }, 'E001 /skills: At most 2 items'],
    ['an empty list item', { skills: [''] }, 'E001 /skills/0: Write something here'],
    ['a map key naming no record', { kit: { net: 1 } }, 'E005 /kit/net: No record weapon:net'],
    ['a map value out of bounds', { kit: { trident: 0 } }, 'E001 /kit/trident: At least 1'],
    ['an enum map key not in the enum', { stats: { luck: 1 } }, 'E001 /stats/luck: Unknown field "luck"'],
    [
      'a free map key that is not a name',
      { notes: { '1st': 'x' } },
      'E001 /notes/1st: Invalid key: Keys start with a letter',
    ],
    ['an unknown field in a group', { record: { wins: 1, draws: 2 } }, 'E001 /record/draws: Unknown field "draws"'],
    ['a colour without its hash', { colour: '3a7bd5' }, 'E001 /colour: Expected a colour like "#3a7bd5"'],
    ['a colour in three digits', { colour: '#3a7' }, 'E001 /colour: Expected a colour like "#3a7bd5"'],
    [
      'an asset of the wrong kind',
      { portrait: 'portraits/spiculus.txt' },
      'E001 /portrait: Expected an image: .png, .jpg',
    ],
    ['an unknown field', { horse: true }, 'E001 /horse: Unknown field "horse"'],
  ])('reports %s', (_name, change, expected) => {
    const found = lines({ ...spiculus, ...change });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(expected);
  });

  it('takes a map keyed by enum with only some of its keys', () => {
    expect(lines({ ...spiculus, stats: { dex: 3 } })).toEqual([]);
  });

  it('reports a missing required field, and leaves optional ones out', () => {
    const { free: _, ...unfree } = spiculus;
    expect(lines(unfree)).toEqual(['E001 /free: Missing field "free"']);
  });

  it('checks asset fields against the files in assets/ when it knows them', () => {
    const value = { ...spiculus, portrait: 'portraits/spiculus.png' };
    expect(lines(value)).toEqual([]);
    expect(lines(value, new Set(['portraits/spiculus.png']))).toEqual([]);
    expect(lines(value, new Set(['portraits/flamma.png']))).toEqual([
      'E018 /portrait: No file assets/portraits/spiculus.png',
    ]);
    // A path the schema already refused is one problem, not two.
    expect(lines({ ...spiculus, portrait: '../spiculus.png' }, new Set())).toEqual([
      'E001 /portrait: Expected a path inside assets/, with "/" between folders',
    ]);
  });

  it('says which records hold each asset path, files that aren’t there included (M2.7)', () => {
    const value = { ...spiculus, portrait: 'portraits/spiculus.png' };
    const { assetsUsedBy } = validateRecords(
      types,
      [
        ...base,
        { type: 'gladiator', id: 'spiculus', file: 'records/gladiator/spiculus.json', value },
        { type: 'gladiator', id: 'crixus', value: { ...value, portrait: 'portraits/crixus.png' } },
        { type: 'gladiator', id: 'odd', value: { ...value, portrait: '../odd.png' } },
      ],
      { assets: new Set(['portraits/spiculus.png']) },
    );
    expect(Object.fromEntries(assetsUsedBy)).toEqual({
      'portraits/crixus.png': [{ from: 'gladiator:crixus', path: '/portrait' }],
      'portraits/spiculus.png': [
        { from: 'gladiator:spiculus', file: 'records/gladiator/spiculus.json', path: '/portrait' },
      ],
    });
  });

  it('takes conditions as text or as trees', () => {
    expect(lines({ ...spiculus, fights: 'arena.day and not crowd.angry' })).toEqual([]);
    expect(lines({ ...spiculus, fights: { fact: 'arena.day' } })).toEqual([]);
    expect(lines({ ...spiculus, fights: 'arena.day and' })).toEqual([
      'E011 /fights: Expected a fact, like hold.count, but the text ended (column 14)',
    ]);
  });

  it('takes a list of effects, each checked against its own schema (M3.7)', () => {
    expect(lines({ ...spiculus, deeds: [] })).toEqual([]);
    // An effect the engine doesn't know is kept as written without a game's catalogue (D36).
    expect(lines({ ...spiculus, deeds: [{ effect: 'cheer', loud: true }] })).toEqual([]);
    expect(lines({ ...spiculus, deeds: [{ effect: 'add-to-flag', flag: 'glory', by: 1.5 }] })).toEqual([
      'E001 /deeds/0/by: Expected a whole number',
      'E005 /deeds/0/flag: No record flag:glory',
    ]);
    expect(lines({ ...spiculus, deeds: [{ to: 1 }] })).toEqual([
      'E001 /deeds/0: An effect names itself: {"effect": "set-flag", …}',
    ]);
    expect(lines({ ...spiculus, deeds: { effect: 'cheer' } })).toEqual(['E001 /deeds: Expected a list of effects']);
  });

  it('exports labels, help and marks to JSON Schema', () => {
    const schema = recordJsonSchema(gladiator.recordType) as {
      title: string;
      properties: Record<string, Record<string, unknown>>;
    };
    expect(schema.title).toBe('Gladiator');
    expect(schema.properties.school).toMatchObject({ title: 'Trained at', 'x-eb-ref': 'school' });
    expect(schema.properties.portrait).toMatchObject({ description: 'Shown on the roster', 'x-eb-asset': 'image' });
    expect(schema.properties.fights).toEqual({ $ref: '#/$defs/eb-condition' });
    expect(schema.properties.deeds).toEqual({ type: 'array', items: { $ref: '#/$defs/eb-effect' } });
  });
});
