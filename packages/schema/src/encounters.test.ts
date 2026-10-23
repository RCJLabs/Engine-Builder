/**
 * The encounters kit's types and checks (M4.7, docs/specs/encounters.md#checks): the type files
 * with the kit on, a sound pit clean, E035 at a combat's crossed bounds and a fighter named twice,
 * E054 for a fight nobody fights for the player in, W137, and a fight in an event's choice checked
 * like any other effect.
 */
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostics.ts';
import { kitTypeFiles } from './kitTypes.ts';
import { type RecordInput, validateRecords } from './validate.ts';

const record = (type: string, id: string, value: unknown): RecordInput => ({
  type,
  id,
  file: `records/${type}/${id}.json`,
  value,
});
const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map(({ code, id, path }) => `${code} ${id} ${path}`);
const check = (records: RecordInput[], kits: string[]) => codes(validateRecords([], records, { kits }).diagnostics);
const WITH_ROSTER = ['stats', 'roster', 'events', 'encounters'];
const ALONE = ['stats', 'events', 'encounters'];

const BASE = [
  record('stat', 'vigour', { name: 'Vigour', start: 10 }),
  record('stat', 'skill', { name: 'Skill', start: 50 }),
  record('stat', 'strength', { name: 'Strength', start: 2 }),
  record('status', 'injured', { name: 'Injured' }),
  record('actor', 'crixus', { name: 'Crixus' }),
  record('actor', 'thracian', { name: 'Thracian' }),
  record('combat', 'bout', { name: 'A bout', health: 'vigour', hit: 'skill', damage: 'strength', rounds: 12 }),
];
const encounter = (more: object = {}) =>
  record('encounter', 'pits', { name: 'The pits', combat: 'bout', foes: [{ actor: 'thracian' }], ...more });
const event = (fight: object) =>
  record('event', 'games', { name: 'The games', choices: [{ id: 'send', label: 'Send him', effects: [fight] }] });

describe('the encounters kit’s types', () => {
  it('are combat and encounter, with the kit on', () => {
    const types = kitTypeFiles(['stats', 'encounters']);
    expect(types.get('combat')?.title).toBe('Combat');
    expect(Object.keys(types.get('encounter')?.fields ?? {})).toEqual([
      'name',
      'description',
      'combat',
      'foes',
      'fighters',
      'breaks',
      'win',
      'draw',
      'lose',
      'falls',
    ]);
    expect(kitTypeFiles(['stats']).has('encounter')).toBe(false);
  });

  it('check a sound pit clean, a fight in an event’s choice among it', () => {
    const records = [...BASE, encounter({ falls: { status: 'injured', leave: 'killed' } })];
    expect(check([...records, event({ effect: 'fight', encounter: 'pits', hit: 10 })], WITH_ROSTER)).toEqual([]);
  });

  it('name an encounter, a combat, a foe and a fighter that are there (E005)', () => {
    const records = [
      ...BASE,
      encounter({ combat: 'brawl', foes: [{ actor: 'gaul' }], fighters: ['spartacus'] }),
      event({ effect: 'fight', encounter: 'arena' }),
    ];
    expect(check(records, WITH_ROSTER)).toEqual([
      'E005 pits /combat',
      'E005 pits /fighters/0',
      'E005 pits /foes/0/actor',
      'E005 games /choices/0/effects/0/encounter',
    ]);
  });
});

describe('the encounters kit’s checks', () => {
  it('E035: a hit’s bounds that cross, and a fighter named twice', () => {
    const crossed = record('combat', 'bout', {
      name: 'A bout',
      health: 'vigour',
      hit: 'skill',
      damage: 'strength',
      'hit-min': 60,
      'hit-max': 40,
    });
    const low = record('combat', 'bout', { health: 'vigour', hit: 'skill', damage: 'strength', 'hit-min': 96 });
    const records = (combat: RecordInput, more: RecordInput[] = []) => [
      ...BASE.filter((r) => r.type !== 'combat'),
      combat,
      ...more,
    ];
    expect(check(records(crossed), WITH_ROSTER)).toEqual(['E035 bout /hit-max']);
    expect(check(records(low), WITH_ROSTER)).toEqual(['E035 bout /hit-min']);
    const twice = [
      encounter({ fighters: ['crixus', 'crixus'] }),
      event({ effect: 'fight', encounter: 'pits', fighters: ['thracian', 'crixus', 'thracian'] }),
    ];
    expect(check([...BASE, ...twice], WITH_ROSTER)).toEqual([
      'E035 pits /fighters/1',
      'E035 games /choices/0/effects/0/fighters/2',
    ]);
  });

  it('E054: a fight that names no fighters, nor does its encounter, without the roster kit', () => {
    const fight = event({ effect: 'fight', encounter: 'pits' });
    expect(check([...BASE, encounter(), fight], ALONE)).toEqual(['E054 games /choices/0/effects/0']);
    expect(check([...BASE, encounter(), fight], WITH_ROSTER)).toEqual([]);
    expect(check([...BASE, encounter({ fighters: ['crixus'] }), fight], ALONE)).toEqual([]);
    const named = event({ effect: 'fight', encounter: 'pits', fighters: ['crixus'] });
    expect(check([...BASE, encounter(), named], ALONE)).toEqual([]);
  });

  it('W137: the fallen leave a roster the game doesn’t have', () => {
    const leaving = encounter({ fighters: ['crixus'], falls: { leave: 'killed' } });
    expect(check([...BASE, leaving], ALONE)).toEqual(['W137 pits /falls/leave']);
    expect(check([...BASE, leaving], WITH_ROSTER)).toEqual([]);
  });

  it('a stance is whole numbers within ±100, and the effect has no field it doesn’t know', () => {
    const wild = event({ effect: 'fight', encounter: 'pits', hit: 150, aim: 3 });
    expect(check([...BASE, encounter(), wild], WITH_ROSTER)).toEqual([
      'E001 games /choices/0/effects/0/aim',
      'E001 games /choices/0/effects/0/hit',
    ]);
  });
});
