/**
 * The roster kit's types and checks (M3.6, docs/specs/roster.md#checks): E035 at each rule's
 * bound, E040 in each kind of condition that names a rank, a band or a bond, and W117.
 */
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostics.ts';
import { kitTypeFiles } from './kitTypes.ts';
import { readTypeFile } from './typeFile.ts';
import { type RecordInput, validateRecords } from './validate.ts';

const ON = ['inventory', 'economy', 'stats', 'roster'];
const record = (type: string, id: string, value: unknown): RecordInput => ({
  type,
  id,
  file: `records/${type}/${id}.json`,
  value,
});
const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map(({ code, id, path }) => `${code} ${id} ${path}`);
const check = (records: RecordInput[], kits = ON) => validateRecords([], records, { kits }).diagnostics;
const fields = (on: string[], type: string) => Object.keys(kitTypeFiles(on).get(type)?.fields ?? {});
const row = (condition: string, effects: object[] = []) =>
  record('sheet', 'watch', { rows: [{ id: 'a', when: { event: 'roster/joined' }, if: condition, do: effects }] });

const CREW = {
  cap: 4,
  start: ['ana', 'bo'],
  ranks: {
    stat: 'fights',
    bands: [{ id: 'green' }, { id: 'veteran', from: 3, status: 'seasoned' }],
  },
  bonds: { min: 0, max: 20, bands: [{ id: 'strangers' }, { id: 'mates', from: 4 }] },
};
const DECKHAND = {
  actor: 'hand',
  names: ['Ketil'],
  stats: { aim: { min: 1, max: 4 } },
  traits: [{ status: 'steady', chance: 50, fee: { credits: 20 } }],
  fee: { credits: 30 },
};
const BASE = [
  record('stat', 'fights', { min: 0 }),
  record('stat', 'aim', { min: 0, max: 10 }),
  record('status', 'steady', { modifiers: [{ stat: 'aim', add: 1 }] }),
  record('status', 'seasoned', { modifiers: [{ stat: 'aim', add: 1 }] }),
  record('status', 'wounded', { lasts: { days: 3 } }),
  record('status', 'quick', { modifiers: [{ stat: 'fights', add: 1 }] }),
  record('actor', 'ana', {}),
  record('actor', 'bo', {}),
  record('actor', 'hand', { stats: { aim: 2 } }),
  record('resource', 'credits', {}),
  record('hall', 'dock', { offers: 2, recruits: [{ recruit: 'deckhand', weight: 3 }] }),
];
const SOUND = [...BASE, record('recruit', 'deckhand', DECKHAND), record('roster', 'crew', CREW)];
const withRoster = (changes: object) => [
  ...BASE,
  record('recruit', 'deckhand', DECKHAND),
  record('roster', 'crew', { ...CREW, ...changes }),
];

describe('the roster kit’s types', () => {
  it('are the recruit, the hall and the roster, each a type file forms can draw', () => {
    expect([...kitTypeFiles(['stats', 'roster']).keys()]).toEqual([
      'stat',
      'actor',
      'status',
      'recruit',
      'hall',
      'roster',
    ]);
    expect(fields(ON, 'recruit')).toEqual([
      'name',
      'description',
      'actor',
      'names',
      'bynames',
      'stats',
      'traits',
      'most',
      'fee',
    ]);
    for (const type of ['recruit', 'hall', 'roster']) expect(readTypeFile(kitTypeFiles(ON).get(type)).ok).toBe(true);
    // With the kit off, the names are free for a project's own types.
    expect(kitTypeFiles(['stats']).has('roster')).toBe(false);
  });

  it('check clean when they hold together', () => {
    expect(check(SOUND)).toEqual([]);
  });

  it('name resources in a fee with the economy kit on, and anything without it', () => {
    const wrong = { ...DECKHAND, fee: { gold: 5 } };
    expect(codes(check([...BASE, record('recruit', 'deckhand', wrong)]))).toEqual(['E005 deckhand /fee/gold']);
    const off = ['stats', 'roster'];
    const free = check([...BASE.filter((r) => r.type !== 'resource'), record('recruit', 'deckhand', wrong)], off);
    expect(codes(free)).toEqual(['W117 deckhand /fee', 'W117 deckhand /traits/0/fee']);
  });
});

describe('recruits, halls and the roster that hold together', () => {
  it('roll stats upwards, and draw each trait once', () => {
    const odd = {
      ...DECKHAND,
      stats: { aim: { min: 4, max: 3 }, fights: { min: 2, max: 2 } },
      traits: [
        { status: 'steady', chance: 50 },
        { status: 'steady', chance: 10 },
      ],
    };
    expect(codes(check([...BASE, record('recruit', 'deckhand', odd)]))).toEqual([
      'E035 deckhand /stats/aim/max',
      'E035 deckhand /traits/1/status',
    ]);
  });

  it('offer each recruit from one entry of a hall', () => {
    const twice = { recruits: [{ recruit: 'deckhand' }, { recruit: 'deckhand', weight: 2 }] };
    const found = check([...SOUND.filter((r) => r.type !== 'hall'), record('hall', 'dock', twice)]);
    expect(codes(found)).toEqual(['E035 dock /recruits/1/recruit']);
  });

  it('have one roster record, read by id', () => {
    const found = check([...SOUND, record('roster', 'zz-second', {}), record('roster', 'third', {})]);
    expect(codes(found)).toEqual(['E035 third ', 'E035 zz-second ']);
    expect(found[0]?.message).toBe('A game has one roster: crew is the one read, so this one does nothing');
  });

  it('start each member once, within the cap, and give a cap one way', () => {
    expect(codes(check(withRoster({ start: ['ana', 'bo', 'ana'] })))).toEqual(['E035 crew /start/2']);
    expect(codes(check(withRoster({ cap: 1 })))).toEqual(['E035 crew /start']);
    expect(codes(check(withRoster({ cap: 2 })))).toEqual([]);
    const flags = [record('flag', 'berths', { number: { start: 3 } }), record('flag', 'docked', {})];
    const capped = (changes: object) => codes(check([...withRoster(changes), ...flags]));
    // Sorted by file: the flags' come first.
    expect(capped({ 'cap-flag': 'berths' })).toEqual(['W110 docked ', 'E035 crew /cap-flag']);
    expect(capped({ cap: undefined, 'cap-flag': 'docked' })).toEqual(['W110 berths ', 'E035 crew /cap-flag']);
    expect(capped({ cap: undefined, 'cap-flag': 'berths' })).toEqual(['W110 docked ']);
  });

  it('rank lowest first, by statuses that last as long as the rank and leave its stat alone', () => {
    const ranks = (bands: object[]) => codes(check(withRoster({ ranks: { stat: 'fights', bands } })));
    expect(ranks([{ id: 'green' }, { id: 'veteran' }])).toEqual(['E035 crew /ranks/bands/1']);
    expect(
      ranks([
        { id: 'green', from: 2 },
        { id: 'veteran', from: 2 },
      ]),
    ).toEqual(['E035 crew /ranks/bands/1/from']);
    expect(ranks([{ id: 'green' }, { id: 'green', from: 1 }])).toEqual(['E035 crew /ranks/bands/1/id']);
    expect(ranks([{ id: 'Green' }])).toEqual(['E035 crew /ranks/bands/0/id']);
    expect(ranks([{ id: 'green' }, { id: 'hurt', from: 1, status: 'wounded' }])).toEqual([
      'E035 crew /ranks/bands/1/status',
    ]);
    expect(ranks([{ id: 'green' }, { id: 'fast', from: 1, status: 'quick' }])).toEqual([
      'E035 crew /ranks/bands/1/status',
    ]);
    // A status that changes another stat is a rank's to give.
    expect(ranks([{ id: 'green', status: 'steady' }])).toEqual([]);
  });

  it('keep bonds within bounds that run upwards, starting and in bands inside them', () => {
    const bonds = (b: object) => codes(check(withRoster({ bonds: b })));
    expect(bonds({ min: 5, max: 4 })).toEqual(['E035 crew /bonds/max']);
    expect(bonds({ min: 0, max: 10, start: 11 })).toEqual(['E035 crew /bonds/start']);
    expect(bonds({ min: 0, max: 10, start: 10 })).toEqual([]);
    expect(bonds({ min: 0, max: 10, bands: [{ id: 'a' }, { id: 'b', from: 11 }] })).toEqual([
      'E035 crew /bonds/bands/1/from',
    ]);
    expect(bonds({ min: 0, max: 10, bands: [{ id: 'a' }, { id: 'b', from: 10 }] })).toEqual([]);
  });

  it('never give a written actor an id a recruit could be called', () => {
    const named = (id: string) => codes(check([...SOUND, record('actor', id, {})]));
    expect(named('deckhand-4')).toEqual(['E035 deckhand-4 ']);
    expect(named('deckhand-0')).toEqual(['E035 deckhand-0 ']);
    expect(named('deckhand-04')).toEqual([]);
    expect(named('deckhand-x')).toEqual([]);
    expect(named('medic-4')).toEqual([]);
  });

  it('change a bond between two actors, not one', () => {
    const bond = (actor: string, other: string) => ({ effect: 'change-bond', actor, with: other, by: 1 });
    expect(codes(check([...SOUND, row('roster.count >= 1', [bond('ana', 'ana')])]))).toEqual([
      'E035 watch /rows/0/do/0/with',
    ]);
    expect(codes(check([...SOUND, row('roster.count >= 1', [bond('ana', 'bo')])]))).toEqual([]);
  });
});

describe('conditions on the roster (E040)', () => {
  it('name ranks the ladder has', () => {
    expect(
      codes(check([...SOUND, row('roster.reached(actor: ana, rank: veteran) and roster.ranked(green) >= 1')])),
    ).toEqual([]);
    for (const condition of [
      'roster.reached(actor: ana, rank: admiral)',
      'roster.ranked(admiral) >= 1',
      'roster.rank(ana) == admiral',
      'roster.rank(ana) != admiral',
    ]) {
      const found = check([...SOUND, row(condition)]);
      expect(codes(found), condition).toEqual(['E040 watch /rows/0/if']);
      expect(found[0]?.message).toBe('The roster has no rank admiral: its ranks are green, veteran');
    }
    // A rank compared by order is the lint's to judge, not a rank named.
    expect(codes(check([...SOUND, row('roster.rank(ana) == veteran')]))).toEqual([]);
    const none = check([...SOUND.filter((r) => r.type !== 'roster'), row('roster.ranked(veteran) >= 1')]);
    expect(none.map((d) => d.message)).toEqual(['The roster has no ranks']);
  });

  it('name bands the bonds have, and pairs of two actors', () => {
    expect(codes(check([...SOUND, row('roster.bond-band(actor: ana, with: bo) == mates')]))).toEqual([]);
    const found = check([...SOUND, row('roster.bond-band(actor: ana, with: bo) == rivals')]);
    expect(found.map((d) => `${d.code} ${d.message}`)).toEqual([
      'E040 The roster’s bonds have no band rivals: its bands are strangers, mates',
    ]);
    const self = check([...SOUND, row('roster.bond(actor: ana, with: ana) >= 1')]);
    expect(self.map((d) => `${d.code} ${d.message}`)).toEqual(['E040 ana has no bond with itself']);
  });
});
