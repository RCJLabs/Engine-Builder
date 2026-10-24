/**
 * The pack's world (M5.8, D70, docs/specs/movement.md#spaces-in-the-pack-format-9): a project with
 * a space packs as format 9, its trigger zones resolved through prefabs, prefabs inside prefabs and
 * overrides, their conditions as trees; one without keeps its format and its hash. Flags a zone
 * sets or reads, or a screen reads, count for the flags' lint.
 */
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile.ts';
import { memorySource } from './source.ts';

const json = (value: unknown) => JSON.stringify(value);

const SET = [{ effect: 'set-flag', flag: 'seen', to: true }];
const BUMP = [{ effect: 'add-to-flag', flag: 'visits', by: 1 }];

const SHRINE = {
  name: 'Shrine',
  objects: [
    { id: 'stone', shape: 'box', components: { collider: {} } },
    { id: 'zone', shape: 'box', scale: [3, 3, 3], components: { trigger: { effects: SET, once: true } } },
  ],
};
const PAIR = { name: 'Pair', objects: [{ id: 'inner', prefab: 'shrine', at: [2, 0, 0] }] };

const YARD = {
  name: 'Yard',
  objects: [
    { id: 'gate', shape: 'box', components: { trigger: { when: 'flag.on(seen)', effects: BUMP } } },
    { id: 'east', prefab: 'shrine', at: [5, 0, 0] },
    {
      id: 'west',
      prefab: 'shrine',
      at: [-5, 0, 0],
      overrides: { zone: { components: { trigger: { once: false } } } },
    },
    { id: 'pairs', prefab: 'pair' },
  ],
};

function project(files: Record<string, unknown>) {
  return memorySource({
    'project.json': '{ "format": 1, "id": "yard", "name": "Yard", "version": "0.1.0" }',
    'records/flag/seen.json': json({ name: 'Seen' }),
    'records/flag/visits.json': json({ name: 'Visits', number: { min: 0, max: 9 } }),
    ...Object.fromEntries(Object.entries(files).map(([path, value]) => [path, json(value)])),
  });
}

describe('the pack’s world', () => {
  it('packs the spaces as format 9, each zone by its path, through prefabs and their overrides', async () => {
    const result = await compileProject(
      project({ 'spaces/yard.json': YARD, 'prefabs/shrine.json': SHRINE, 'prefabs/pair.json': PAIR }),
      [],
    );
    // Visits is counted, and nothing reads it: the flags' lint, below.
    expect(result.diagnostics.map((d) => d.code)).toEqual(['W108']);
    const pack = result.pack;
    expect(pack?.format).toBe(9);
    expect(pack?.world?.spaces).toEqual({ yard: YARD });
    expect(pack?.world?.prefabs).toEqual({ shrine: SHRINE, pair: PAIR });
    expect(pack?.world?.triggers).toEqual({
      yard: {
        // Its condition written as text, packed as the tree the sim checks.
        gate: { when: { fact: 'flag.on', args: { flag: 'seen' } }, effects: BUMP },
        'east/zone': { effects: SET, once: true },
        'west/zone': { effects: SET, once: false },
        'pairs/inner/zone': { effects: SET, once: true },
      },
    });
    // Nothing placed, no environment, no terrain: nothing more to draw from.
    expect(pack?.world?.files).toEqual({});
    expect(pack?.world?.records).toEqual({});
    expect(pack?.world?.fields).toEqual({});
  });

  it('leaves a space without zones out of the triggers', async () => {
    const pack = (await compileProject(project({ 'spaces/empty.json': { name: 'Empty', objects: [] } }), [])).pack;
    expect(pack?.format).toBe(9);
    expect(pack?.world?.triggers).toEqual({});
  });

  it('keeps a project without spaces at its format, a prefab alone included', async () => {
    const pack = (await compileProject(project({ 'prefabs/shrine.json': SHRINE }), [])).pack;
    expect(pack?.format).toBe(1);
    expect(pack).not.toHaveProperty('world');
  });

  it('counts a zone’s flags for the lint: set by one, read by another', async () => {
    const lint = async (files: Record<string, unknown>) =>
      (await compileProject(project(files), [])).diagnostics.map((d) => `${d.code} ${d.file} ${d.message}`);
    // Seen is set by the shrine's zone and read by the gate's; visits is set by the gate's alone.
    expect(await lint({ 'spaces/yard.json': YARD, 'prefabs/shrine.json': SHRINE, 'prefabs/pair.json': PAIR })).toEqual([
      "W108 records/flag/visits.json Set by spaces/yard.json, but no condition or row's When reads it",
    ]);
    const gateless = { ...YARD, objects: YARD.objects.slice(1) };
    expect(
      await lint({ 'spaces/yard.json': gateless, 'prefabs/shrine.json': SHRINE, 'prefabs/pair.json': PAIR }),
    ).toEqual([
      // The yard's too: its west placement overrides the zone, which is checked there whole.
      "W108 records/flag/seen.json Set by prefabs/shrine.json and spaces/yard.json, but no condition or row's When reads it",
      'W110 records/flag/visits.json Nothing sets or reads this flag',
    ]);
  });

  it('counts a screen’s shows-when and bindings as reading a flag', async () => {
    const screen = (top: unknown) => ({ shows: ['play'], top, main: { widget: 'text', text: 'Here.' } });
    const lint = async (top: unknown) =>
      (
        await compileProject(
          project({
            'spaces/yard.json': { ...YARD, objects: YARD.objects.slice(1) },
            'prefabs/shrine.json': SHRINE,
            'prefabs/pair.json': PAIR,
            'ui/play.json': screen(top),
          }),
          [],
        )
      ).diagnostics
        .filter((d) => d.file === 'records/flag/seen.json' || d.file === 'records/flag/visits.json')
        .map((d) => `${d.code} ${d.file}`);
    expect(await lint({ widget: 'text', text: 'Seen.', 'shows-when': 'flag.on(seen)' })).toEqual([
      'W110 records/flag/visits.json',
    ]);
    expect(await lint({ widget: 'text', text: '{flag.number(flag: visits)} visits' })).toEqual([
      'W108 records/flag/seen.json',
      'W109 records/flag/visits.json',
    ]);
  });
});
