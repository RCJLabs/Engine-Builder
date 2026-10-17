import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRecordStore, formatRef, isRecordId, MAX_ID_LENGTH, parseRef } from './records.ts';

const recordId = fc.stringMatching(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).filter((text) => text.length <= MAX_ID_LENGTH);

describe('record ids', () => {
  it.each(['a', '9', 'medkit', 'dead-hauler', 'loot-table', 'a1-b2-c3', 'x'.repeat(64)])('accepts %s', (id) => {
    expect(isRecordId(id)).toBe(true);
  });

  it.each([
    '',
    'Medkit',
    'dead_hauler',
    '-medkit',
    'medkit-',
    'dead--hauler',
    'dead hauler',
    'item:medkit',
    'ö',
    'x'.repeat(65),
    'medkit\n',
  ])('rejects %j', (id) => {
    expect(isRecordId(id)).toBe(false);
  });

  it('agrees with the length-and-words rule it encodes', () => {
    const words = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    fc.assert(
      fc.property(fc.oneof(recordId, fc.stringMatching(/^[a-z0-9-]{0,70}$/), fc.string()), (text) => {
        expect(isRecordId(text)).toBe(text.length <= MAX_ID_LENGTH && words.test(text));
      }),
    );
  });

  it('rejects values that are not strings', () => {
    for (const value of [5, null, undefined, ['medkit'], { id: 'medkit' }]) expect(isRecordId(value)).toBe(false);
  });
});

describe('references', () => {
  it('reads a qualified reference', () => {
    expect(parseRef('item:medkit')).toEqual({ type: 'item', id: 'medkit' });
    expect(parseRef('loot-table:dead-hauler')).toEqual({ type: 'loot-table', id: 'dead-hauler' });
  });

  it('caps each side at 64 characters', () => {
    const long = 'x'.repeat(64);
    expect(parseRef(`${long}:${long}`)).toEqual({ type: long, id: long });
    expect(parseRef(`${long}x:a`)).toBeNull();
    expect(parseRef(`a:${long}x`)).toBeNull();
  });

  it.each([
    'medkit',
    'item:',
    ':medkit',
    'item:med:kit',
    'Item:medkit',
    'item: medkit',
    'item.medkit',
    'item:medkit\n',
    '',
  ])('returns null for %j', (text) => {
    expect(parseRef(text)).toBeNull();
  });

  it('round-trips every valid type and id', () => {
    fc.assert(
      fc.property(recordId, recordId, (type, id) => {
        expect(formatRef(type, id)).toBe(`${type}:${id}`);
        expect(parseRef(formatRef(type, id))).toEqual({ type, id });
      }),
    );
  });
});

describe('record store', () => {
  // Integer-like keys come out of Object.keys first and in numeric order: the store must not.
  const pack = () => ({
    item: {
      zeta: { name: 'Zeta' },
      alpha: { name: 'Alpha', tags: ['rare'] },
      '10': { name: 'Ten' },
      '9': { name: 'Nine' },
    },
    actor: { rook: { hp: 7 } },
    empty: {},
  });

  it('lists types and ids in UTF-16 order, leaving out empty types', () => {
    const store = createRecordStore(pack());
    expect(store.types()).toEqual(['actor', 'item']);
    expect(store.ids('item')).toEqual(['10', '9', 'alpha', 'zeta']);
    expect(store.entries('item').map(([id]) => id)).toEqual(['10', '9', 'alpha', 'zeta']);
    expect(store.ids('nothing')).toEqual([]);
    expect(store.entries('nothing')).toEqual([]);
  });

  it('pairs each id with its record', () => {
    const store = createRecordStore(pack());
    expect(store.entries('actor')).toEqual([['rook', { hp: 7 }]]);
    expect(store.get('item', 'alpha')).toEqual({ name: 'Alpha', tags: ['rare'] });
    expect(store.getOrThrow('actor', 'rook')).toEqual({ hp: 7 });
  });

  it('answers misses without throwing, except getOrThrow', () => {
    const store = createRecordStore(pack());
    expect(store.has('item', 'alpha')).toBe(true);
    expect(store.has('item', 'beta')).toBe(false);
    expect(store.get('item', 'beta')).toBeUndefined();
    expect(store.get('nothing', 'alpha')).toBeUndefined();
    expect(() => store.getOrThrow('item', 'beta')).toThrow('No record item:beta');
    expect(() => store.getOrThrow('nothing', 'alpha')).toThrow('No record nothing:alpha');
  });

  it('does not see Object.prototype through its lookups', () => {
    const store = createRecordStore({ constructor: { constructor: { ok: true } } });
    expect(store.getOrThrow('constructor', 'constructor')).toEqual({ ok: true });
    expect(store.has('constructor', 'hasownproperty')).toBe(false);
    expect(store.has('item', 'constructor')).toBe(false);
    expect(store.get('item', 'constructor')).toBeUndefined();
  });

  it('freezes every record and every list it returns', () => {
    const shared = Object.freeze({ inner: { hp: 1 } }); // frozen, with an unfrozen child
    const store = createRecordStore({ item: { alpha: { tags: ['rare'], extra: shared } } });
    const alpha = store.getOrThrow<{ tags: string[]; extra: { inner: { hp: number } } }>('item', 'alpha');
    expect(() => {
      alpha.tags.push('common');
    }).toThrow(TypeError);
    expect(() => {
      alpha.extra.inner.hp = 2;
    }).toThrow(TypeError);
    for (const list of [store.types(), store.ids('item'), store.entries('item'), store.entries('item')[0]]) {
      expect(Object.isFrozen(list)).toBe(true);
    }
  });

  it('rejects names that are not valid ids', () => {
    expect(() => createRecordStore({ Item: { alpha: {} } })).toThrow('"Item" is not a valid record type name');
    expect(() => createRecordStore({ item: { 'Big Gun': {} } })).toThrow(
      '"item:Big Gun" does not have a valid record id',
    );
  });
});
