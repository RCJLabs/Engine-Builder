/**
 * The tactics kit's types and checks (M7.5, D87, docs/specs/tactics.md#checks): the type files with the kit
 * on, an actor's gun and order, a sound boarding clean, E035 for an order without its number and a crew
 * member named twice, W160 for a unit with no gun, and start-battle checked as an effect.
 */
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostics.ts';
import { kitEffectFiles } from './kitEffects.ts';
import { kitTypeFiles } from './kitTypes.ts';
import { type RecordInput, validateRecords } from './validate.ts';

const record = (type: string, id: string, value: unknown): RecordInput => ({
  type,
  id,
  file: `records/${type}/${id}.json`,
  value,
});
const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map(({ code, id, path }) => `${code} ${id} ${path}`);
const KITS = ['stats', 'tactics'];
const check = (records: RecordInput[]) => codes(validateRecords([], records, { kits: KITS }).diagnostics);

const gun = {
  damage: { least: 3, most: 5 },
  accuracy: { close: 0, mid: 10, long: 0 },
  crit: 10,
  'crit-damage': 2,
  clip: 4,
};
const BASE = [
  ...['health', 'aim', 'mobility'].map((id) => record('stat', id, { name: id })),
  record('status', 'hurt', { name: 'Hurt' }),
  record('battle-rules', 'boarding', { health: 'health', aim: 'aim', mobility: 'mobility', 'half-cover': 25 }),
  record('gun', 'rifle', gun),
  record('order', 'suppress', { kind: 'suppress', uses: 2, aim: -30 }),
  record('actor', 'ines', { name: 'Ines', gun: 'rifle', order: 'suppress' }),
  record('actor', 'oren', { name: 'Oren', gun: 'rifle' }),
  record('actor', 'pirate', { name: 'Pirate', gun: 'rifle' }),
];
const battle = (more: object = {}) =>
  record('battle', 'boarders', {
    rules: 'boarding',
    space: 'deck',
    crew: [
      { actor: 'ines', at: 'ines' },
      { actor: 'oren', at: 'oren' },
    ],
    foes: [
      { actor: 'pirate', at: 'hatch-1' },
      { actor: 'pirate', at: 'hatch-2' },
    ],
    falls: 'hurt',
    win: [{ effect: 'add-status', actor: 'ines', status: 'hurt' }],
    ...more,
  });

describe('the tactics kit’s types', () => {
  it('are battle rules, guns, orders and battles, with the kit on, and an actor’s gun and order', () => {
    const types = kitTypeFiles(KITS);
    expect(['battle-rules', 'gun', 'order', 'battle'].map((type) => types.get(type)?.title)).toEqual([
      'Battle rules',
      'Gun',
      'Order',
      'Battle',
    ]);
    expect(Object.keys(types.get('actor')?.fields ?? {})).toEqual(expect.arrayContaining(['gun', 'order']));
    expect(kitTypeFiles(['stats']).has('battle')).toBe(false);
    expect(kitEffectFiles(KITS).map((file) => file.effect)).toContain('start-battle');
  });

  it('finds a sound boarding clean', () => {
    expect(check([...BASE, battle()])).toEqual([]);
  });

  it('holds an order to the number its kind reads: E035', () => {
    expect(check([...BASE, record('order', 'patch', { kind: 'patch', uses: 2 })])).toEqual(['E035 patch /hp']);
    expect(check([...BASE, record('order', 'mark', { kind: 'mark', uses: 2, aim: -5 })])).toEqual(['E035 mark /aim']);
    expect(check([...BASE, record('order', 'pin', { kind: 'suppress', uses: 2, aim: 10 })])).toEqual(['E035 pin /aim']);
  });

  it('names each of the crew once: E035; a unit with no gun is W160', () => {
    const twice = battle({
      crew: [
        { actor: 'ines', at: 'a' },
        { actor: 'ines', at: 'b' },
      ],
    });
    expect(check([...BASE, twice])).toEqual(['E035 boarders /crew/1/actor']);
    const unarmed = [...BASE.filter((r) => r.id !== 'oren'), record('actor', 'oren', { name: 'Oren' })];
    expect(check([...unarmed, battle()])).toEqual(['W160 boarders /crew/1/actor']);
  });

  it('checks the fields: one of each side at least, a gun’s bounds, a battle-rules number, start-battle’s battle', () => {
    expect(check([...BASE, battle({ foes: [] })])).toEqual(['E001 boarders /foes']);
    const jammed = [...BASE.filter((r) => r.type !== 'gun'), record('gun', 'rifle', { ...gun, clip: 0 })];
    expect(check([...jammed, battle()])).toEqual(['E001 rifle /clip']);
    expect(check([...BASE, battle({ win: [{ effect: 'start-battle', battle: 'nowhere' }] })])).toEqual([
      'E005 boarders /win/0/battle',
    ]);
  });
});
