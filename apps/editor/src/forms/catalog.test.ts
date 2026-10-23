import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LUDUS, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import { EMPTY_INDEX, updateIndex } from '../records/recordIndex.ts';
import { readCatalog } from './catalog.ts';
import { checkRecord, fieldPointers, routeProblems } from './problems.ts';
import { chooseTitle } from './refChoices.ts';

const ludus = (changes: Record<string, string | null> = {}) => {
  const files: Record<string, string> = readFixture(FIXTURE_LUDUS);
  for (const [path, text] of Object.entries(changes)) {
    if (text === null) delete files[path];
    else files[path] = text;
  }
  return memorySource(files);
};

/** Ludus with these kits listed in its project.json, and other files changed. */
const kitted = (kits: unknown[], changes: Record<string, string | null> = {}) => {
  const manifest = JSON.parse(readFixture(FIXTURE_LUDUS)['project.json'] as string);
  return ludus({ 'project.json': JSON.stringify({ ...manifest, kits }), ...changes });
};

describe('readCatalog with kits (M3.3)', () => {
  it('lists the kits’ types, a project’s own fields joined after a kit’s', async () => {
    const own = { title: 'Part', fields: { maker: { kind: 'text', optional: true } } };
    const catalog = await readCatalog(kitted(['inventory', 'economy'], { 'types/item.json': JSON.stringify(own) }));
    expect(catalog.kits).toEqual(['inventory', 'economy']);
    expect([...catalog.types.keys()]).toEqual(
      expect.arrayContaining(['flag', 'sheet', 'item', 'loot-table', 'resource', 'shop', 'gladiator']),
    );
    const item = catalog.types.get('item');
    expect(item?.file.title).toBe('Part');
    expect(Object.keys(item?.file.fields ?? {})).toEqual(['name', 'description', 'value', 'max', 'tags', 'maker']);
    expect(item?.kit).toEqual({ id: 'inventory', fields: ['name', 'description', 'value', 'max', 'tags'] });
    expect(catalog.problems).toEqual([]);
  });

  it('titles a record picker by its type’s title, with its article', async () => {
    const { types } = await readCatalog(kitted(['inventory']));
    expect(chooseTitle({ kind: 'ref', to: 'item' }, types)).toBe('Choose an item');
    expect(chooseTitle({ kind: 'ref', to: 'loot-table' }, types)).toBe('Choose a loot table');
    expect(chooseTitle({ kind: 'ref', to: ['item', 'school'] }, types)).toBe('Choose a record');
    expect(chooseTitle({ kind: 'ref', to: 'guild' }, types)).toBe('Choose a guild');
  });

  it('turns on no kit whose need is off, and says so at project.json', async () => {
    const catalog = await readCatalog(kitted(['economy']));
    expect(catalog.kits).toEqual([]);
    expect(catalog.types.has('shop')).toBe(false);
    expect(catalog.problems.map((d) => `${d.code} ${d.file} ${d.path}`)).toEqual(['E034 project.json /kits/0']);
  });
});

describe('readCatalog', () => {
  it('lists the types, their records and the assets, sorted', async () => {
    const catalog = await readCatalog(ludus());
    // The engine's flag and sheet come first, with forms of their own (D36).
    expect([...catalog.types.keys()]).toEqual([
      'flag',
      'sheet',
      'sound',
      'ambience',
      'music',
      'gladiator',
      'school',
      'weapon',
    ]);
    // The engine's audio types are tables too, after the project's own (M4.8); its flag and sheet live in Logic.
    expect(catalog.names).toEqual(['gladiator', 'school', 'weapon', 'sound', 'ambience', 'music']);
    expect(catalog.records.get('gladiator')).toEqual(['flamma', 'priscus', 'spiculus']);
    expect(catalog.assets).toEqual(['portraits/spiculus.svg']);
    expect(catalog.broken.size).toBe(0);
  });

  it('reads the provenance log, which is not an asset, or says why it can’t (M2.7)', async () => {
    const catalog = await readCatalog(ludus());
    expect(catalog.assets).not.toContain('assets.json');
    expect(catalog.assetsLog).toMatchObject({ files: { 'portraits/spiculus.svg': { licence: 'own' } } });
    expect(catalog.logProblem).toBeUndefined();
    const broken = await readCatalog(ludus({ 'assets/assets.json': '{ "files": ' }));
    expect(broken.assetsLog).toBeUndefined();
    expect(broken.logProblem).toMatch(/JSON/);
    const none = await readCatalog(ludus({ 'assets/assets.json': null }));
    expect(none.assetsLog).toBeUndefined();
    expect(none.logProblem).toBeUndefined();
  });

  it('sorts records however the folder lists them', async () => {
    const files = Object.entries(readFixture(FIXTURE_LUDUS)).reverse();
    const catalog = await readCatalog(memorySource(Object.fromEntries(files)));
    expect(catalog.records.get('gladiator')).toEqual(['flamma', 'priscus', 'spiculus']);
    expect(catalog.records.get('weapon')).toEqual(['gladius', 'net', 'trident']);
  });

  it('names a type whose file has problems, with its first problem, and types only records name', async () => {
    const catalog = await readCatalog(
      ludus({
        'types/weapon.json': '{ "title": "" , "fields": { "x": { "kind": "y" } } }',
        'records/horse/bucephalus.json': '{}',
      }),
    );
    expect([...catalog.types.keys()]).toEqual(['flag', 'sheet', 'sound', 'ambience', 'music', 'gladiator', 'school']);
    // Its first problem in the file's own order: the title comes before the fields.
    expect(catalog.broken.get('weapon')).toMatchObject({ code: 'E015', file: 'types/weapon.json', path: '/title' });
    expect(catalog.names).toEqual(['gladiator', 'horse', 'school', 'weapon', 'sound', 'ambience', 'music']);
  });

  it('takes no type from a type file the compiler ignores, such as a name that is no type id', async () => {
    const catalog = await readCatalog(ludus({ 'types/Horse.json': '{ "title": "Horse", "fields": {} }' }));
    expect(catalog.problems.map((p) => `${p.code} ${p.file}`)).toEqual(['E017 types/Horse.json']);
    expect([...catalog.broken.keys()]).toEqual([]);
  });
});

describe('checkRecord', () => {
  it('gives one record’s diagnostics, with every other record there for its refs to name', async () => {
    const catalog = await readCatalog(ludus());
    const spiculus = {
      name: 'Spiculus',
      might: 72,
      style: 'murmillo',
      school: 'ludus-magnus',
      free: false,
      skills: [],
      record: { wins: 0, losses: 0 },
    };
    expect(checkRecord(catalog, 'gladiator', 'spiculus', spiculus)).toEqual([]);
    const broken = {
      ...spiculus,
      school: 'ludus-nowhere',
      kit: { net: 0 },
      portrait: 'portraits/flamma.svg',
      fights: 'arena.day and',
    };
    expect(checkRecord(catalog, 'gladiator', 'spiculus', broken).map((d) => `${d.code} ${d.path}`)).toEqual([
      'E011 /fights',
      'E001 /kit/net',
      'E018 /portrait',
      'E005 /school',
    ]);
  });
});

describe('checkRecord with flags (M3.1)', () => {
  it('reads the flags and the records that name them from the index, as the lint and set-flag need them', async () => {
    const sheet = {
      rows: [
        {
          id: 'a',
          when: { event: 'flag/changed' },
          if: 'flag.on(met)',
          do: [{ effect: 'set-flag', flag: 'met', to: 3 }],
        },
      ],
    };
    const source = ludus({ 'records/flag/met.json': '{}', 'records/sheet/s.json': JSON.stringify(sheet) });
    const catalog = await readCatalog(source);
    const index = await updateIndex(EMPTY_INDEX, source, catalog, null);
    // The flag's own form: set and read by the sheet, so no lint; without the index it would be W110.
    expect(checkRecord(catalog, 'flag', 'met', {}, index)).toEqual([]);
    expect(checkRecord(catalog, 'flag', 'met', {}).map((d) => d.code)).toEqual(['W110']);
    // The sheet's form: its set-flag reads the flag's kind.
    expect(checkRecord(catalog, 'sheet', 's', sheet, index).map((d) => `${d.code} ${d.path}`)).toEqual([
      'E026 /rows/0/do/0/to',
    ]);
  });
});

describe('checkRecord with loot tables and shops (M3.3)', () => {
  it('reads the other tables and the shops from the index, as the loop and stock checks need them', async () => {
    const nests = (table: string) => ({ entries: [{ table, weight: 1 }] });
    const source = kitted(['inventory', 'economy'], {
      'records/loot-table/a.json': JSON.stringify(nests('b')),
      'records/loot-table/b.json': JSON.stringify(nests('a')),
      'records/resource/credits.json': '{}',
    });
    const catalog = await readCatalog(source);
    const index = await updateIndex(EMPTY_INDEX, source, catalog, null);
    // a's own form: the loop runs through b, which only the index has.
    expect(checkRecord(catalog, 'loot-table', 'a', nests('b'), index).map((d) => `${d.code} ${d.path}`)).toEqual([
      'E036 /entries/0/table',
    ]);
    // A shop's form: its stock table gives a resource a table down, which only the index has.
    const shop = { currency: 'credits', stock: { table: 'a' } };
    const shopped = kitted(['inventory', 'economy'], {
      'records/loot-table/a.json': JSON.stringify(nests('b')),
      'records/loot-table/b.json': JSON.stringify({ entries: [{ resource: 'credits', weight: 1 }] }),
      'records/resource/credits.json': '{}',
      'records/shop/yard.json': JSON.stringify(shop),
    });
    const giving = await readCatalog(shopped);
    const read = await updateIndex(EMPTY_INDEX, shopped, giving, null);
    expect(checkRecord(giving, 'shop', 'yard', shop, read).map((d) => `${d.code} ${d.path}`)).toEqual([
      'E035 /stock/table',
    ]);
  });
});

describe('routing problems to fields', () => {
  it('sends each to the deepest field shown that holds it, and the rest to the record', async () => {
    const catalog = await readCatalog(ludus());
    const gladiator = catalog.types.get('gladiator')?.file;
    if (!gladiator) throw new Error('no gladiator type');
    const value = { skills: ['a', ''], kit: { net: 1 }, fights: { all: [{ fact: 'A' }] }, horse: 1 };
    const shown = fieldPointers(gladiator, value);
    // Every field the type lists shows, set or not, so a problem with a missing one has a place.
    expect(shown.has('/portrait')).toBe(true);
    expect(shown.has('/record/wins')).toBe(true);
    expect(
      [...shown].filter((p) => p.startsWith('/skills') || p.startsWith('/kit') || p === '' || p === '/fights'),
    ).toEqual(['', '/skills', '/skills/0', '/skills/1', '/kit', '/kit/net', '/fights']);
    const at = (path: string) => ({ code: 'E001' as const, severity: 'error' as const, message: path, path });
    const routed = routeProblems([at('/skills/1'), at('/fights/all/0/fact'), at('/horse'), at('/kit/net')], shown);
    expect(Object.fromEntries([...routed].map(([k, v]) => [k, v.map((d) => d.message)]))).toEqual({
      '/skills/1': ['/skills/1'],
      '/fights': ['/fights/all/0/fact'],
      '': ['/horse'],
      '/kit/net': ['/kit/net'],
    });
  });
});
