/**
 * The clock while walking (M6.3, D75, docs/specs/ai.md#the-clock): project.json's `clock` checked
 * (E080), 20x for a project with the time kit and a space that gives none, unless its calendar can't
 * run at it (W149), and packed as format 12 only when it runs.
 */
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile.ts';
import { checkManifest } from './manifest.ts';
import { readKitSettings } from './projectCheck.ts';
import { memorySource } from './source.ts';

const BASE = { format: 1, id: 'green', name: 'Green', version: '0.1.0' };
const GREEN = { name: 'Green', objects: [{ id: 'bench', shape: 'box' }] };
const MINUTES = { ticksPerDay: 1440 };

const manifest = (more: Record<string, unknown>) => checkManifest({ ...BASE, kits: ['time'], ...more });
const brief = (problems: readonly { code: string; path: string }[]) => problems.map((p) => `${p.code} ${p.path}`);

function project(more: Record<string, unknown>, spaced = true) {
  return memorySource({
    'project.json': JSON.stringify({ ...BASE, ...more }),
    ...(spaced ? { 'spaces/green.json': JSON.stringify(GREEN) } : {}),
  });
}

describe('project.json’s clock', () => {
  it('reads a rate the calendar runs at, 0 stopping it', () => {
    expect(manifest({ calendar: MINUTES, clock: { rate: 20 } })).toMatchObject({ problems: [], clockRate: 20 });
    expect(manifest({ calendar: MINUTES, clock: { rate: 0 } })).toMatchObject({ problems: [], clockRate: 0 });
    // The kit's own calendar, a tick a day, runs too: a tick every 72 real minutes.
    expect(manifest({ clock: { rate: 20 } })).toMatchObject({ problems: [], clockRate: 20 });
    expect(manifest({ calendar: MINUTES })).not.toHaveProperty('clockRate');
  });

  it('is E080 without the time kit, of the wrong shape, or at a rate whose ticks aren’t whole milliseconds', () => {
    const off = checkManifest({ ...BASE, kits: ['inventory'], clock: { rate: 20 } });
    expect(brief(off.problems)).toEqual(['E080 /clock']);
    expect(off.clockRate).toBeNull();
    expect(brief(manifest({ clock: 20 }).problems)).toEqual(['E080 /clock']);
    expect(brief(manifest({ clock: { rate: 20, pace: 2 } }).problems)).toEqual(['E080 /clock']);
    expect(brief(manifest({ clock: [] }).problems)).toEqual(['E080 /clock']);
    for (const rate of [-1, 2.5, 3601, '20'])
      expect(brief(manifest({ clock: { rate } }).problems), String(rate)).toEqual(['E080 /clock/rate']);
    const odd = manifest({ calendar: MINUTES, clock: { rate: 7 } });
    expect(odd.problems).toEqual([
      {
        code: 'E080',
        path: '/clock/rate',
        message:
          "At 7x a tick of 1440 a day isn't a whole number of real milliseconds: pick a rate that splits 86,400,000 ms by 1440 ticks",
      },
    ]);
    // The project still reads, its clock left out.
    expect(odd.project?.kits).toEqual(['time']);
  });
});

describe('the clock a project is walked at', () => {
  it('is 20x with the time kit and a space, packed as format 12', async () => {
    const result = await compileProject(project({ kits: ['time'], calendar: MINUTES }), []);
    expect(result.diagnostics).toEqual([]);
    expect(result.pack?.format).toBe(12);
    expect(result.pack?.project.clock).toEqual({ rate: 20 });
    expect(await readKitSettings(project({ kits: ['time'], calendar: MINUTES }))).toMatchObject({
      clock: { rate: 20 },
    });
  });

  it('is project.json’s rate when it gives one, and none at 0', async () => {
    const quick = await compileProject(project({ kits: ['time'], calendar: MINUTES, clock: { rate: 60 } }), []);
    expect(quick.pack?.project.clock).toEqual({ rate: 60 });
    const still = await compileProject(project({ kits: ['time'], calendar: MINUTES, clock: { rate: 0 } }), []);
    expect(still.diagnostics).toEqual([]);
    expect(still.pack?.format).toBe(9);
    expect(still.pack?.project).not.toHaveProperty('clock');
  });

  it('is none without a space or without the time kit, whose packs keep their formats', async () => {
    const unwalked = await compileProject(project({ kits: ['time'], calendar: MINUTES }, false), []);
    expect(unwalked.pack?.format).toBe(3);
    expect(unwalked.pack?.project).not.toHaveProperty('clock');
    expect(await readKitSettings(project({ kits: ['time'] }, false))).not.toHaveProperty('clock');
    const untimed = await compileProject(project({}), []);
    expect(untimed.pack?.format).toBe(9);
    expect(untimed.pack?.project).not.toHaveProperty('clock');
  });

  it('stays still, W149 saying why, when none is given and the calendar can’t run at 20x', async () => {
    const result = await compileProject(project({ kits: ['time'], calendar: { ticksPerDay: 7 } }), []);
    expect(result.diagnostics.map((d) => `${d.code} ${d.file} ${d.path}`)).toEqual(['W149 project.json ']);
    expect(result.pack?.format).toBe(9);
    // Given, the same rate is E080, and nothing is packed.
    const given = await compileProject(
      project({ kits: ['time'], calendar: { ticksPerDay: 7 }, clock: { rate: 20 } }),
      [],
    );
    expect(given.diagnostics.map((d) => d.code)).toEqual(['E080']);
    expect(given.pack).toBeNull();
  });
});
