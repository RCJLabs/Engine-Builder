import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostics.ts';
import { kitEffectFiles } from './kitEffects.ts';
import { kitTypeFiles } from './kitTypes.ts';
import { ENGINE_EVENTS, ENGINE_FACTS, knownFrom } from './known.ts';
import { readTypeFile } from './typeFile.ts';
import { type RecordInput, validateRecords } from './validate.ts';

const ALL = ['inventory', 'economy', 'factions', 'time'];
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
const row = (condition: string) =>
  record('sheet', 'watch', { rows: [{ id: 'a', when: { event: 'time/day-started' }, if: condition, do: [] }] });

const SOUND = [
  record('faction', 'traders', {
    min: -10,
    max: 10,
    bands: [
      { id: 'hostile', price: 150 },
      { id: 'neutral', from: -1 },
      { id: 'trusted', from: 6, price: 75 },
    ],
    drift: { every: 8, toward: 0 },
  }),
  record('faction', 'crown', { start: 5 }),
  record('resource', 'silver', { step: 5 }),
  record('shop', 'post', { currency: 'silver', faction: 'traders' }),
];

describe('the factions kit’s type', () => {
  it('is the faction, and a shop’s Faction while the economy kit is on too', () => {
    expect([...kitTypeFiles(['factions']).keys()]).toEqual(['faction']);
    expect(fields(['factions'], 'faction')).toEqual(['name', 'description', 'min', 'max', 'start', 'bands', 'drift']);
    expect(fields(ALL, 'shop')).toContain('faction');
    expect(fields(['inventory', 'economy'], 'shop')).not.toContain('faction');
    expect(readTypeFile(kitTypeFiles(ALL).get('faction')).ok).toBe(true);
  });

  it('checks clean when it holds together', () => {
    expect(check(SOUND)).toEqual([]);
  });
});

describe('factions that hold together', () => {
  it('have bounds that run upwards, and a start and resting value within them', () => {
    const found = check([
      ...SOUND,
      record('faction', 'upside', { min: 5, max: 4 }),
      record('faction', 'early', { min: 0, max: 10, start: -1 }),
      record('faction', 'late', { min: 0, max: 10, start: 11 }),
      record('faction', 'restless', { min: 0, max: 10, drift: { every: 1, toward: 11 } }),
      // Bounds that meet are fine.
      record('faction', 'fixed', { min: 3, max: 3, start: 3 }),
    ]);
    expect(codes(found)).toEqual([
      'E035 early /start',
      'E035 late /start',
      'E035 restless /drift/toward',
      'E035 upside /max',
    ]);
  });

  it('list their bands lowest first, each but the first saying where it begins, each once, by a name', () => {
    const banded = (bands: object[]) => record('faction', 'f', { min: -10, max: 10, bands });
    const at = (bands: object[]) => codes(check([...SOUND, banded(bands)]));
    expect(at([{ id: 'low' }, { id: 'high' }])).toEqual(['E035 f /bands/1']);
    expect(
      at([
        { id: 'low', from: 0 },
        { id: 'high', from: 0 },
      ]),
    ).toEqual(['E035 f /bands/1/from']);
    expect(
      at([
        { id: 'low', from: 0 },
        { id: 'high', from: 11 },
      ]),
    ).toEqual(['E035 f /bands/1/from']);
    expect(at([{ id: 'low', from: -11 }])).toEqual(['E035 f /bands/0/from']);
    expect(at([{ id: 'low' }, { id: 'low', from: 2 }])).toEqual(['E035 f /bands/1/id']);
    expect(at([{ id: 'Low' }])).toEqual(['E035 f /bands/0/id']);
    // At its bounds and rising by one, fine.
    expect(
      at([
        { id: 'low', from: -10 },
        { id: 'mid', from: -9 },
        { id: 'top', from: 10 },
      ]),
    ).toEqual([]);
  });

  it('are named in conditions by bands they have (E039)', () => {
    const found = check([
      ...SOUND,
      row('factions.reached(faction: traders, band: trusted) and factions.band(traders) != neutral'),
      record('sheet', 'typos', {
        rows: [
          {
            id: 'a',
            when: { event: 'time/day-started' },
            if: 'factions.reached(faction: traders, band: trustd)',
            do: [],
          },
          { id: 'b', when: { event: 'time/day-started' }, if: 'factions.band(traders) == netural', do: [] },
          { id: 'c', when: { event: 'time/day-started' }, if: 'factions.band(crown) == loyal', do: [] },
          { id: 'd', when: { event: 'time/day-started' }, if: 'factions.band(traders) != trustd', do: [] },
        ],
      }),
    ]);
    expect(codes(found)).toEqual([
      'E039 typos /rows/0/if',
      'E039 typos /rows/1/if',
      'E039 typos /rows/2/if',
      'E039 typos /rows/3/if',
    ]);
    expect(found.map((d) => d.message)).toEqual([
      'traders has no band trustd: its bands are hostile, neutral, trusted',
      'traders has no band netural: its bands are hostile, neutral, trusted',
      'crown has no bands',
      'traders has no band trustd: its bands are hostile, neutral, trusted',
    ]);
  });

  it('warn of drift in a game whose events have no time module (W115)', () => {
    const closed = { facts: ENGINE_FACTS, events: ENGINE_EVENTS };
    expect(codes(check(SOUND, { ...closed, kits: ['inventory', 'economy', 'factions'] }))).toEqual([
      'W115 traders /drift',
    ]);
    expect(check(SOUND, closed)).toEqual([]);
    // A game whose scripts haven't run may have a time module of its own: no warning.
    expect(check(SOUND, { kits: ['inventory', 'economy', 'factions'] })).toEqual([]);
  });
});

describe('the factions and time kits’ effects', () => {
  it('are known with their kits on, and checked against their fields, the time kit’s in the calendar’s units', () => {
    const calendar = { ticksPerDay: 24, units: { hours: 1 } };
    expect(knownFrom({ kits: ['factions'] }).effects.schemas.has('change-standing')).toBe(true);
    expect(knownFrom({ kits: ['factions'] }).effects.schemas.has('wait')).toBe(false);
    const sheet = record('sheet', 'day', {
      rows: [
        {
          id: 'a',
          when: { event: 'time/day-started' },
          do: [
            { effect: 'change-standing', faction: 'traders', by: 2.5 },
            { effect: 'wait', hours: 6 },
            { effect: 'wait', months: 1 },
            {
              effect: 'schedule',
              after: { days: 1 },
              effects: [{ effect: 'change-standing', faction: 'nobody', by: 1 }],
            },
            { effect: 'cancel-timer', timer: 'Not A Name' },
          ],
        },
      ],
    });
    expect(codes(check([...SOUND, sheet], { calendar }))).toEqual([
      'E001 day /rows/0/do/0/by',
      'E001 day /rows/0/do/2/months',
      'E005 day /rows/0/do/3/effects/0/faction',
      'E001 day /rows/0/do/4/timer',
    ]);
  });

  it('list in the kits’ order, wait’s lengths as the calendar names them', () => {
    const files = kitEffectFiles(['factions', 'time'], { ticksPerDay: 24, units: { hours: 1, weeks: 168 } });
    expect(files.map((f) => f.effect)).toEqual(['change-standing', 'wait', 'cancel-timer']);
    expect(Object.entries(files[1]?.fields ?? {}).map(([unit, field]) => [unit, field.label])).toEqual([
      ['ticks', 'Ticks'],
      ['days', 'Days'],
      ['hours', 'Hours'],
      ['weeks', 'Weeks'],
    ]);
  });
});
