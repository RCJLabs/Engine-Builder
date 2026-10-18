import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostics.ts';
import { kitEffectFiles } from './kitEffects.ts';
import { isKitType, joinKitType, kitOf, kitTypeFiles } from './kitTypes.ts';
import { ENGINE_FACTS, knownFrom } from './known.ts';
import { readTypeFile } from './typeFile.ts';
import { type RecordInput, validateRecords } from './validate.ts';

const BOTH = ['inventory', 'economy'];
const record = (type: string, id: string, value: unknown): RecordInput => ({
  type,
  id,
  file: `records/${type}/${id}.json`,
  value,
});
const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map(({ code, id, path }) => `${code} ${id} ${path}`);
const check = (records: RecordInput[], options = {}) =>
  validateRecords([], records, { kits: BOTH, ...options }).diagnostics;

const SOUND = [
  record('item', 'reactor', { name: 'Reactor', value: 200, tags: ['part'] }),
  record('resource', 'credits', { start: 50, step: 5 }),
  record('loot-table', 'scrap', { nothing: 60, entries: [{ item: 'reactor', weight: 40 }] }),
  record('shop', 'yard', { currency: 'credits', buys: {}, stock: { table: 'scrap', every: { days: 2 } } }),
];

describe('the kits’ types', () => {
  it('are those of the kits on, a loot table naming resources only with the economy', () => {
    expect([...kitTypeFiles(['inventory']).keys()]).toEqual(['item', 'loot-table']);
    expect([...kitTypeFiles(BOTH).keys()]).toEqual(['item', 'loot-table', 'resource', 'shop']);
    const entry = (on: string[]) => {
      const entries = kitTypeFiles(on).get('loot-table')?.fields.entries;
      return entries?.kind === 'list' && entries.of.kind === 'group' ? Object.keys(entries.of.fields) : [];
    };
    expect(entry(['inventory'])).not.toContain('resource');
    expect(entry(BOTH)).toContain('resource');
    expect(isKitType('shop', BOTH)).toBe(true);
    expect(isKitType('shop', ['inventory'])).toBe(false);
    expect(kitOf('loot-table', BOTH)).toBe('inventory');
    expect(kitOf('gladiator', BOTH)).toBeUndefined();
  });

  it('are sound type files, as the type designer reads them', () => {
    for (const [type, file] of kitTypeFiles(BOTH)) expect(readTypeFile(file).ok, type).toBe(true);
  });

  it('take a project’s fields after the kit’s, its title over the kit’s, and refuse a field the kit has', () => {
    const kit = kitTypeFiles(BOTH).get('item');
    if (!kit) throw new Error('no item');
    const { joined, clashes } = joinKitType(kit, { title: 'Part', fields: { maker: { kind: 'text' } } });
    expect(clashes).toEqual([]);
    const read = readTypeFile(joined);
    if (!read.ok) throw new Error(JSON.stringify(read.issues));
    expect(read.file.title).toBe('Part');
    expect(read.file.nameField).toBe('name');
    expect(Object.keys(read.file.fields)).toEqual([...Object.keys(kit.fields), 'maker']);
    const clash = joinKitType(kit, { fields: { value: { kind: 'text' }, maker: { kind: 'text' } } });
    expect(clash.clashes).toEqual(['value']);
    expect(Object.keys((clash.joined as { fields: object }).fields)).toEqual(Object.keys(kit.fields));
  });
});

describe('records of the kits’ types', () => {
  it('check clean when they hold together', () => {
    expect(check(SOUND)).toEqual([]);
  });

  it('are of a type the project doesn’t have with the kit off', () => {
    expect(codes(validateRecords([], SOUND.slice(0, 1)).diagnostics)).toEqual(['E002 reactor ']);
  });

  it('are checked against the kit’s fields: unknown keys and bad values are E001, a missing ref E005', () => {
    const found = codes(
      check([
        ...SOUND,
        record('item', 'odd', { value: -1, weight: 2 }),
        record('shop', 'nowhere', { currency: 'gold' }),
      ]),
    );
    expect(found).toEqual(expect.arrayContaining(['E001 odd /value', 'E001 odd /weight', 'E005 nowhere /currency']));
  });

  it('hold together: one thing an entry, ranges that run upwards, starts within bounds, buying under selling', () => {
    const found = codes(
      check([
        ...SOUND,
        record('loot-table', 'odd', {
          picks: { min: 3, max: 1 },
          entries: [
            { item: 'reactor', table: 'scrap', weight: 1 },
            { weight: 1 },
            { item: 'reactor', weight: 1, count: { min: 4, max: 2 } },
          ],
        }),
        record('resource', 'fuel', { min: 5 }),
        record('resource', 'heat', { start: 9, max: 3 }),
        record('resource', 'water', { min: 3, max: 1 }),
        record('shop', 'kind', { currency: 'credits', 'buys-at': 120 }),
      ]),
    );
    // In file order: loot tables, then resources, then shops.
    expect(found).toEqual([
      'E035 odd /entries/0',
      'E035 odd /entries/1',
      'E035 odd /entries/2/count/max',
      'E035 odd /picks/max',
      'E035 fuel /min',
      'E035 heat /start',
      'E035 water /max',
      'E035 kind /buys-at',
    ]);
  });

  it('find loot tables nested in a loop, once, at the first table, with the way round', () => {
    const diagnostics = check([
      ...SOUND,
      record('loot-table', 'a', { entries: [{ table: 'b', weight: 1 }] }),
      record('loot-table', 'b', {
        entries: [
          { item: 'reactor', weight: 1 },
          { table: 'c', weight: 1 },
        ],
      }),
      record('loot-table', 'c', { entries: [{ table: 'a', weight: 1 }] }),
      record('loot-table', 'self', { entries: [{ table: 'self', weight: 1 }] }),
    ]);
    expect(diagnostics.map(({ code, id, path, message }) => ({ code, id, path, message }))).toEqual([
      { code: 'E036', id: 'a', path: '/entries/0/table', message: 'Loot tables nest in a loop: a → b → c → a' },
      { code: 'E036', id: 'self', path: '/entries/0/table', message: 'Loot tables nest in a loop: self → self' },
    ]);
  });

  it('stop a shop stocked from a table that gives a resource, however deep', () => {
    const diagnostics = check([
      ...SOUND,
      record('loot-table', 'cash', { entries: [{ resource: 'credits', weight: 1 }] }),
      record('loot-table', 'mixed', { entries: [{ table: 'cash', weight: 1 }] }),
      record('shop', 'bank', { currency: 'credits', stock: { table: 'mixed' } }),
    ]);
    expect(codes(diagnostics)).toEqual(['E035 bank /stock/table']);
    expect(diagnostics[0]?.message).toContain('credits (in cash)');
  });

  it('warn of a shop that stocks again in a game whose facts have no time.day', () => {
    expect(codes(check(SOUND, { facts: ENGINE_FACTS }))).toEqual(['W113 yard /stock/every']);
    // With the engine's facts left open, the game may have days: nothing to say.
    expect(check(SOUND)).toEqual([]);
  });
});

describe('what the checks know with the kits on', () => {
  it('has the kits’ facts, events and effects beside the engine’s', () => {
    const known = knownFrom({ kits: BOTH });
    expect(known.facts['inventory.count']?.domain).toEqual({ type: 'int', min: 0 });
    expect(known.facts['economy.price']).toBeDefined();
    expect(known.facts['flag.on']).toBeDefined();
    expect(Object.keys(known.events)).toEqual(
      expect.arrayContaining(['inventory/gained', 'economy/bought', 'flag/changed']),
    );
    expect([...known.effects.schemas.keys()]).toEqual(
      expect.arrayContaining(['give-item', 'roll-loot', 'pay-cost', 'open-shop', 'set-flag', 'roll']),
    );
    expect(knownFrom({ kits: ['inventory'] }).effects.schemas.has('pay-cost')).toBe(false);
    expect(knownFrom({}).facts['inventory.count']).toBeUndefined();
  });

  it('checks a kit’s effect in content against its fields', () => {
    const sheet = record('sheet', 'gifts', {
      rows: [
        {
          id: 'gift',
          when: { event: 'economy/bought' },
          do: [
            { effect: 'give-item', item: 'reactor', count: 0 },
            { effect: 'give-item', item: 'ghost' },
            { effect: 'pay-cost', cost: { credits: 5, gold: 1 } },
          ],
        },
      ],
    });
    expect(codes(check([...SOUND, sheet]))).toEqual([
      'E001 gifts /rows/0/do/0/count',
      'E005 gifts /rows/0/do/1/item',
      'E005 gifts /rows/0/do/2/cost/gold',
    ]);
  });

  it('lists each kit’s effects with their fields, for the editor’s forms', () => {
    expect(kitEffectFiles(['inventory']).map((f) => f.effect)).toEqual(['give-item', 'take-item', 'roll-loot']);
    expect(kitEffectFiles(BOTH).map((f) => f.effect)).toEqual([
      'give-item',
      'take-item',
      'roll-loot',
      'add-resource',
      'pay-cost',
      'open-shop',
    ]);
  });
});
