import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LUDUS, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import { readCatalog } from './catalog.ts';
import { checkRecord, fieldPointers, routeProblems } from './problems.ts';

const ludus = (changes: Record<string, string | null> = {}) => {
  const files: Record<string, string> = readFixture(FIXTURE_LUDUS);
  for (const [path, text] of Object.entries(changes)) {
    if (text === null) delete files[path];
    else files[path] = text;
  }
  return memorySource(files);
};

describe('readCatalog', () => {
  it('lists the types, their records and the assets, sorted', async () => {
    const catalog = await readCatalog(ludus());
    expect([...catalog.types.keys()]).toEqual(['gladiator', 'school', 'weapon']);
    expect(catalog.names).toEqual(['gladiator', 'school', 'weapon']);
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
    expect([...catalog.types.keys()]).toEqual(['gladiator', 'school']);
    // Its first problem in the file's own order: the title comes before the fields.
    expect(catalog.broken.get('weapon')).toMatchObject({ code: 'E015', file: 'types/weapon.json', path: '/title' });
    expect(catalog.names).toEqual(['gladiator', 'horse', 'school', 'weapon']);
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
