import type { Diagnostic } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { compileProject, editionSource, leaveOutOf, memorySource, packageIdFor, projectFiles } from './index.ts';

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** A store with rope and a map of the summit, and the map's own asset: enough to leave things out of. */
const store = (exported?: unknown, extra: Record<string, string> = {}) =>
  memorySource({
    'project.json': json({
      format: 1,
      id: 'store',
      name: 'The store',
      version: '0.1.0',
      kits: ['inventory', 'economy'],
    }),
    'records/item/rope.json': json({ name: 'Rope', value: 8 }),
    'records/item/summit-map.json': json({ name: 'A map of the summit, every bolt marked', value: 40 }),
    'records/resource/coins.json': json({ name: 'Coins', start: 30 }),
    'records/shop/store.json': json({
      name: 'The store',
      currency: 'coins',
      stock: { items: [{ item: 'rope', count: 2 }] },
    }),
    'assets/art/icon.png': 'not really a png',
    'assets/art/summit.png': 'nor this',
    'assets/assets.json': json({
      files: {
        'art/icon.png': { licence: 'own', source: 'Drawn for the store', date: '2026-10-23' },
        'art/summit.png': { licence: 'own', source: 'Drawn for the map', date: '2026-10-23' },
      },
    }),
    ...(exported === undefined ? {} : { 'export.json': typeof exported === 'string' ? exported : json(exported) }),
    ...extra,
  });

const brief = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.filter((d) => d.code >= 'E055' || d.code.startsWith('W13')).map((d) => `${d.code} ${d.file} ${d.path}`);

const taster = { editions: { taster: { 'leave-out': { records: ['item:summit-map'] } } } };

describe('export.json (M4.10)', () => {
  it('is optional, and a sound one changes nothing in the pack', async () => {
    const without = await compileProject(store(), []);
    const withIt = await compileProject(store({ ...taster, targets: { file: { edition: 'taster' } } }), []);
    expect(without.diagnostics).toEqual([]);
    expect(withIt.diagnostics).toEqual([]);
    expect(withIt.pack?.hash).toBe(without.pack?.hash);
  });

  it('travels with the project, as project.json does', async () => {
    expect(await projectFiles(store(taster))).toContain('export.json');
  });

  it('isn’t JSON: E007, and the rest of the project is still checked', async () => {
    const result = await compileProject(store('{ nope'), []);
    expect(result.diagnostics.map((d) => `${d.code} ${d.file}`)).toEqual(['E007 export.json']);
  });

  it('is the wrong shape: E056 at each place', async () => {
    const result = await compileProject(
      store({
        orientation: 'sideways',
        colors: { theme: 'blue' },
        targets: { web: { domain: 'https://x.com/' }, ios: {} },
      }),
      [],
    );
    expect(brief(result.diagnostics)).toEqual([
      'E056 export.json /colors/theme',
      'E056 export.json /orientation',
      'E056 export.json /targets/ios',
      'E056 export.json /targets/web/domain',
    ]);
    expect(result.pack).toBeNull();
  });

  it('names what isn’t there: E056 for each list, a missing edition, a full edition and the icon', async () => {
    const result = await compileProject(
      store({
        icon: 'art/missing.png',
        editions: {
          full: {},
          Demo: {},
          taster: {
            'leave-out': {
              types: ['spell'],
              records: ['item:sword', 'nonsense'],
              scenes: ['dusk'],
              assets: ['art/none.png', 'art/summit.png'],
            },
          },
        },
        targets: { file: { edition: 'lite' }, itch: { edition: 'taster' } },
      }),
      [],
    );
    expect(brief(result.diagnostics)).toEqual([
      'E056 export.json /editions/Demo',
      'E056 export.json /editions/full',
      'E056 export.json /editions/taster/leave-out/assets/0',
      'E056 export.json /editions/taster/leave-out/records/0',
      'E056 export.json /editions/taster/leave-out/records/1',
      'E056 export.json /editions/taster/leave-out/scenes/0',
      'E056 export.json /editions/taster/leave-out/types/0',
      'E056 export.json /icon',
      'E056 export.json /targets/file/edition',
    ]);
  });

  it('won’t leave out the icon, which every edition shows', async () => {
    const result = await compileProject(
      store({ icon: 'art/icon.png', editions: { taster: { 'leave-out': { assets: ['art/icon.png'] } } } }),
      [],
    );
    expect(result.diagnostics.map((d) => d.message)).toEqual(['The icon is in every edition: it can’t be left out']);
  });

  it('E055: a kept record naming a left-out one, at the naming field, for each edition', async () => {
    const stocked = json({
      name: 'The store',
      currency: 'coins',
      stock: {
        items: [
          { item: 'rope', count: 2 },
          { item: 'summit-map', count: 1 },
        ],
      },
    });
    const result = await compileProject(
      store(
        { editions: { ...taster.editions, lite: { 'leave-out': { types: ['item'] } } } },
        { 'records/shop/store.json': stocked },
      ),
      [],
    );
    expect(result.diagnostics.map((d) => `${d.code} ${d.type}:${d.id} ${d.path} ${d.message}`)).toEqual([
      'E055 shop:store /stock/items/0/item Names item:rope, which the lite edition leaves out',
      'E055 shop:store /stock/items/1/item Names item:summit-map, which the lite edition leaves out',
      'E055 shop:store /stock/items/1/item Names item:summit-map, which the taster edition leaves out',
    ]);
  });

  it('E055 doesn’t count a record the edition leaves out too', async () => {
    const both = { editions: { taster: { 'leave-out': { records: ['item:rope', 'shop:store', 'resource:coins'] } } } };
    expect((await compileProject(store(both), [])).diagnostics).toEqual([]);
  });

  it('W138 for a long short name, W139 and E056 for an Android app missing what it needs', async () => {
    const result = await compileProject(
      store({ name: 'The store at the end of the road', targets: { android: { package: 'com.rcjlabs.store' } } }),
      [],
    );
    expect(brief(result.diagnostics)).toEqual([
      'W138 export.json /name',
      'E056 export.json /targets/android',
      'W139 export.json /targets/android/fingerprints',
    ]);
  });

  it('offers com.rcjlabs.<game> as the package id (D60)', () => {
    expect(packageIdFor('the-hut')).toBe('com.rcjlabs.thehut');
    expect(packageIdFor('2060-td')).toBe('com.rcjlabs.game2060td');
  });
});

describe('an edition’s files (M4.10)', () => {
  it('compile as a project that never had what it leaves out', async () => {
    const source = store(taster);
    const out = leaveOutOf(taster, 'taster');
    const edition = await compileProject(editionSource(source, out), []);
    expect(edition.diagnostics).toEqual([]);
    expect(Object.keys(edition.pack?.records.item ?? {})).toEqual(['rope']);
    expect(await editionSource(source, out).read('export.json')).toBeUndefined();
  });

  it('hide a left-out type’s records and type file, a scene, and an asset with its log line', async () => {
    const source = store(undefined, {
      'types/note.json': json({ fields: { text: { kind: 'text' } } }),
      'records/note/one.json': json({ text: 'A note' }),
      'scenes/dusk.ink': 'Dusk.\n-> END\n',
    });
    const out = { types: ['note'], records: [], scenes: ['dusk'], assets: ['art/summit.png'] };
    const edition = editionSource(source, out);
    expect(await edition.files('records')).not.toContain('records/note/one.json');
    expect(await edition.files('types')).toEqual([]);
    expect(await edition.files('scenes')).toEqual([]);
    expect(await edition.files('assets')).toEqual(['assets/art/icon.png', 'assets/assets.json']);
    expect(await edition.read('assets/art/summit.png')).toBeUndefined();
    const log = JSON.parse(new TextDecoder().decode(await edition.read('assets/assets.json')));
    expect(Object.keys(log.files)).toEqual(['art/icon.png']);
    expect(leaveOutOf(undefined, 'full')).toEqual({ types: [], records: [], scenes: [], assets: [] });
  });
});
