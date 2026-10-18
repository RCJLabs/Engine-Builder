import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostics.ts';
import { kitEffectFiles } from './kitEffects.ts';
import { kitTypeFiles } from './kitTypes.ts';
import { ENGINE_FACTS, knownFrom } from './known.ts';
import { readTypeFile } from './typeFile.ts';
import { type RecordInput, validateRecords } from './validate.ts';

const ALL = ['inventory', 'stats', 'gear'];
const record = (type: string, id: string, value: unknown): RecordInput => ({
  type,
  id,
  file: `records/${type}/${id}.json`,
  value,
});
const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map(({ code, id, path }) => `${code} ${id} ${path}`);
const check = (records: RecordInput[], options = {}) =>
  validateRecords([], records, { kits: ALL, ...options }).diagnostics;
const fields = (on: string[], type: string) => Object.keys(kitTypeFiles(on).get(type)?.fields ?? {});

const SOUND = [
  record('stat', 'health', { min: 0, max: 100, start: 10 }),
  record('stat', 'aim', { start: 50 }),
  record('status', 'bleeding', { modifiers: [{ stat: 'aim', add: -10 }], lasts: { days: 3 }, stacks: 3 }),
  record('slot', 'hand', { name: 'Hand' }),
  record('item', 'rifle', { value: 120, slot: 'hand', modifiers: [{ stat: 'aim', add: 10 }] }),
  record('actor', 'ana', {
    stats: { health: 10, aim: 70 },
    statuses: ['bleeding'],
    slots: ['hand'],
    wears: { hand: 'rifle' },
  }),
];

describe('the stats and gear kits’ types', () => {
  it('are the stats kit’s three, the gear kit’s slot, and gear’s fields on items and actors', () => {
    expect([...kitTypeFiles(['stats']).keys()]).toEqual(['stat', 'actor', 'status']);
    expect([...kitTypeFiles(ALL).keys()]).toEqual(['item', 'loot-table', 'stat', 'actor', 'status', 'slot']);
    expect(fields(['stats'], 'actor')).toEqual(['name', 'description', 'stats', 'statuses']);
    expect(fields(ALL, 'actor')).toEqual(['name', 'description', 'stats', 'statuses', 'slots', 'wears']);
    expect(fields(['inventory'], 'item')).not.toContain('slot');
    expect(fields(ALL, 'item')).toEqual(expect.arrayContaining(['slot', 'modifiers']));
    for (const [type, file] of kitTypeFiles(ALL)) expect(readTypeFile(file).ok, type).toBe(true);
  });

  it('check clean when they hold together', () => {
    expect(check(SOUND)).toEqual([]);
  });
});

describe('records of the stats and gear kits', () => {
  it('hold together: bounds that run upwards, starts and bases within them, modifiers that do something', () => {
    const found = codes(
      check([
        ...SOUND,
        record('stat', 'grit', { min: 5, max: 2 }),
        record('stat', 'luck', { min: 0, max: 10, start: 11 }),
        record('status', 'odd', { modifiers: [{ stat: 'aim' }], lasts: { days: 1, ticks: 2 } }),
        record('status', 'empty', { lasts: {} }),
        record('actor', 'bo', { stats: { health: 101, aim: -1 } }),
      ]),
    );
    expect(found).toEqual([
      'E035 bo /stats/aim',
      'E035 bo /stats/health',
      'E035 grit /max',
      'E035 luck /start',
      'E035 empty /lasts',
      'E035 odd /lasts',
      'E035 odd /modifiers/0',
    ]);
  });

  it('wear only what fits: the item’s own slot, one the actor has, an item that can be worn', () => {
    const found = codes(
      check([
        ...SOUND,
        record('slot', 'head', {}),
        record('item', 'medkit', { value: 30 }),
        record('item', 'cap', { slot: 'head' }),
        record('actor', 'bo', { slots: ['hand'], wears: { head: 'cap' } }),
        record('actor', 'cy', { wears: { hand: 'medkit', head: 'rifle' } }),
      ]),
    );
    expect(found).toEqual(['E035 bo /wears/head', 'E035 cy /wears/hand', 'E035 cy /wears/head']);
  });

  it('warn of a status that lasts days in a game whose facts have no time module', () => {
    expect(codes(check(SOUND, { facts: ENGINE_FACTS }))).toEqual(['W114 bleeding /lasts']);
    expect(check(SOUND)).toEqual([]);
  });
});

describe('the stats and gear kits’ effects', () => {
  it('are known with their kits on, and checked against their fields', () => {
    expect(knownFrom({ kits: ['stats'] }).effects.schemas.has('damage-stat')).toBe(true);
    expect(knownFrom({ kits: ['stats'] }).effects.schemas.has('equip')).toBe(false);
    const sheet = record('sheet', 'fight', {
      rows: [
        {
          id: 'hit',
          when: { event: 'stats/damaged' },
          do: [
            { effect: 'damage-stat', actor: 'ana', stat: 'health', by: 0 },
            { effect: 'add-status', actor: 'ana', status: 'bleeding', stacks: 2 },
            { effect: 'heal-stat', actor: 'ana', stat: 'luck' },
            { effect: 'equip', actor: 'ana', item: 'rifle' },
            { effect: 'unequip', actor: 'ana', slot: 'foot' },
          ],
        },
      ],
    });
    expect(codes(check([...SOUND, sheet]))).toEqual([
      'E001 fight /rows/0/do/0/by',
      'E005 fight /rows/0/do/2/stat',
      'E005 fight /rows/0/do/4/slot',
    ]);
  });

  it('list in the kits’ order, for the editor’s forms', () => {
    expect(kitEffectFiles(['stats', 'gear']).map((f) => f.effect)).toEqual([
      'add-to-stat',
      'damage-stat',
      'heal-stat',
      'add-status',
      'remove-status',
      'equip',
      'unequip',
    ]);
  });
});
