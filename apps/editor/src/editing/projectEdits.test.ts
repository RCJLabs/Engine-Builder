import { memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { calendarProblems } from '../app/calendarFile.ts';
import {
  calendarChange,
  kitsChange,
  kitsStep,
  kitsWith,
  manifestChange,
  manifestProblem,
  withCalendar,
} from './projectEdits.ts';

const MANIFEST = '{\n  "format": 1,\n  "id": "salvage-run",\n  "name": "Salvage Run",\n  "version": "0.1.0"\n}\n';
const decode = (bytes: Uint8Array | null | undefined) => (bytes ? new TextDecoder().decode(bytes) : bytes);

describe('manifestChange', () => {
  it('sets the field in place, keeping the key order and layout', async () => {
    const change = await manifestChange(memorySource({ 'project.json': MANIFEST }), 'name', 'Dirtbag Valley');
    expect(change?.path).toBe('project.json');
    expect(decode(change?.before)).toBe(MANIFEST);
    expect(decode(change?.after)).toBe(MANIFEST.replace('"Salvage Run"', '"Dirtbag Valley"'));
  });

  it('gives no change when the field already holds the value, or there is no project.json', async () => {
    expect(await manifestChange(memorySource({ 'project.json': MANIFEST }), 'version', '0.1.0')).toBeNull();
    expect(await manifestChange(memorySource({}), 'name', 'x')).toBeNull();
  });
});

describe('manifestProblem', () => {
  it('wants a name with more than spaces in it', () => {
    expect(manifestProblem('name', 'Dirtbag')).toBeNull();
    expect(manifestProblem('name', '   ')).toBe('A project needs a name.');
    expect(manifestProblem('name', '')).toBe('A project needs a name.');
  });

  it('wants a version the compiler reads, in its own words', () => {
    expect(manifestProblem('version', '1.2.0-beta.1')).toBeNull();
    expect(manifestProblem('version', '1.2')).toBe('Expected a version like "1.2.0" or "1.2.0-beta.1"');
  });
});

describe('kitsWith', () => {
  it('turns on what a kit needs with it, in the engine’s order', () => {
    expect(kitsWith([], 'economy', true)).toEqual(['inventory', 'economy']);
    expect(kitsWith([], 'inventory', true)).toEqual(['inventory']);
    expect(kitsWith(['economy'], 'inventory', true)).toEqual(['inventory', 'economy']);
  });

  it('turns on both of gear’s needs, and turns gear off with either', () => {
    expect(kitsWith([], 'gear', true)).toEqual(['inventory', 'stats', 'gear']);
    expect(kitsWith(['inventory', 'stats', 'gear'], 'stats', false)).toEqual(['inventory']);
    expect(kitsWith(['inventory', 'economy', 'stats', 'gear'], 'inventory', false)).toEqual(['stats']);
  });

  it('turns off what needs a kit with it, and nothing it needs', () => {
    expect(kitsWith(['inventory', 'economy'], 'inventory', false)).toEqual([]);
    expect(kitsWith(['inventory', 'economy'], 'economy', false)).toEqual(['inventory']);
  });
});

describe('kitsStep', () => {
  it('names the kit, and what came along with it', () => {
    expect(kitsStep('economy', true, [], ['inventory', 'economy'])).toBe('Turn on the economy kit, with inventory');
    expect(kitsStep('inventory', true, [], ['inventory'])).toBe('Turn on the inventory kit');
    expect(kitsStep('inventory', false, ['inventory', 'economy'], [])).toBe('Turn off the inventory kit, with economy');
    expect(kitsStep('economy', false, ['inventory', 'economy'], ['inventory'])).toBe('Turn off the economy kit');
  });
});

describe('kitsChange', () => {
  const kitted = MANIFEST.replace('\n}', ',\n  "kits": [\n    "inventory"\n  ]\n}');

  it('puts kits last in a project.json without them, keeping its layout', async () => {
    const change = await kitsChange(memorySource({ 'project.json': MANIFEST }), ['inventory']);
    expect(decode(change?.after)).toBe(kitted);
  });

  it('changes kits where they are, and takes them out when none are on', async () => {
    const first = '{\n  "kits": ["inventory"],\n  "format": 1\n}\n';
    const change = await kitsChange(memorySource({ 'project.json': first }), ['inventory', 'economy']);
    expect(JSON.parse(decode(change?.after) as string)).toEqual({ kits: ['inventory', 'economy'], format: 1 });
    expect(Object.keys(JSON.parse(decode(change?.after) as string))).toEqual(['kits', 'format']);
    expect(decode((await kitsChange(memorySource({ 'project.json': kitted }), []))?.after)).toBe(MANIFEST);
  });

  it('gives no change when the kits are already those, or there is no project.json', async () => {
    expect(await kitsChange(memorySource({ 'project.json': kitted }), ['inventory'])).toBeNull();
    expect(await kitsChange(memorySource({ 'project.json': MANIFEST }), [])).toBeNull();
    expect(await kitsChange(memorySource({}), ['inventory'])).toBeNull();
  });
});

describe('calendarChange (M3.5)', () => {
  const read = (change: { after: Uint8Array | null }[]) => JSON.parse(decode(change[0]?.after) as string);

  it('adds a calendar last, read as an empty one while it is left out', async () => {
    const change = await calendarChange(memorySource({ 'project.json': MANIFEST }), (calendar) => {
      expect(calendar).toEqual({});
      return { ticksPerDay: 24 };
    });
    expect(Object.keys(read(change))).toEqual(['format', 'id', 'name', 'version', 'calendar']);
    expect(read(change).calendar).toEqual({ ticksPerDay: 24 });
  });

  it('hands the change the calendar there, which keeps its place', async () => {
    const timed = '{\n  "format": 1,\n  "calendar": { "ticksPerDay": 24 },\n  "kits": ["time"]\n}\n';
    const change = await calendarChange(memorySource({ 'project.json': timed }), (calendar) => ({
      ...(calendar as object),
      daysPerYear: 360,
    }));
    expect(read(change)).toEqual({ format: 1, calendar: { ticksPerDay: 24, daysPerYear: 360 }, kits: ['time'] });
    expect(Object.keys(read(change))).toEqual(['format', 'calendar', 'kits']);
  });

  it('takes out a list left empty, and the calendar once nothing is left in it', () => {
    const manifest = { format: 1, calendar: { weekdays: ['sun'], ticksPerDay: 24 }, kits: ['time'] };
    expect(withCalendar(manifest, { weekdays: [], ticksPerDay: 24 })).toEqual({
      format: 1,
      calendar: { ticksPerDay: 24 },
      kits: ['time'],
    });
    expect(Object.keys(withCalendar(manifest, { ticksPerDay: 6 }) as object)).toEqual(['format', 'calendar', 'kits']);
    expect(withCalendar(manifest, { weekdays: [] })).toEqual({ format: 1, kits: ['time'] });
    expect(withCalendar(manifest, undefined)).toEqual({ format: 1, kits: ['time'] });
    // An empty group stays: Add Start makes one, to be filled in.
    expect(withCalendar(manifest, { start: {} })).toEqual({ format: 1, calendar: { start: {} }, kits: ['time'] });
  });

  it('gives no change when the calendar is already that, or there is no project.json', async () => {
    expect(await calendarChange(memorySource({ 'project.json': MANIFEST }), () => ({}))).toEqual([]);
    expect(await calendarChange(memorySource({}), () => ({ ticksPerDay: 2 }))).toEqual([]);
  });
});

describe('calendarProblems (M3.5)', () => {
  it('are project.json’s under /calendar, at their place in the calendar', () => {
    const at = (file: string, path: string) =>
      ({ code: 'E038', severity: 'error', message: 'm', type: '', id: '', file, path }) as const;
    const found = calendarProblems([
      at('project.json', '/calendar'),
      at('project.json', '/calendar/months/0/days'),
      at('project.json', '/calendars'),
      at('project.json', '/kits/0'),
      at('records/sheet/a.json', '/calendar'),
    ]);
    expect(found.map((d) => d.path)).toEqual(['', '/months/0/days']);
  });
});
