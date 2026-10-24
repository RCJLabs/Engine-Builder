/**
 * Components, placed records and overrides checked against the project (M5.2, D64): E062 to E066,
 * E058 for an override's shape, W142, the kinds in components/, and the uses "used by" lists.
 */
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile.ts';
import { memorySource } from './source.ts';

const json = (value: unknown) => JSON.stringify(value);

/** A project with a keeper type and one keeper, a lamp prefab, and a house that places a door. */
function project(files: Record<string, unknown>) {
  return memorySource({
    'project.json': '{ "format": 1, "id": "yard", "name": "Yard", "version": "0.1.0" }',
    'types/keeper.json': json({
      title: 'Keeper',
      nameField: 'name',
      fields: {
        name: { kind: 'text', max: 40 },
        greeting: { kind: 'text', optional: true },
        friend: { kind: 'ref', to: 'keeper', optional: true },
      },
    }),
    'records/keeper/tom.json': json({ name: 'Tom' }),
    'prefabs/lamp.json': json({
      name: 'Lamp',
      objects: [
        { id: 'post', shape: 'cylinder', scale: [0.2, 3, 0.2] },
        { id: 'bulb', shape: 'sphere', at: [0, 3, 0], components: { light: { range: 8 } } },
      ],
    }),
    'prefabs/door.json': json({ name: 'Door', objects: [{ id: 'knob', shape: 'sphere' }] }),
    'prefabs/house.json': json({
      name: 'House',
      objects: [
        { id: 'walls', shape: 'box' },
        { id: 'door', prefab: 'door', overrides: { knob: { color: '#c0a040' } } },
        { id: 'host', record: 'keeper:tom' },
      ],
    }),
    ...Object.fromEntries(Object.entries(files).map(([path, value]) => [path, json(value)])),
  });
}

const yard = (objects: unknown[]) => ({ 'spaces/yard.json': { name: 'Yard', objects } });

async function problems(files: Record<string, unknown>): Promise<string[]> {
  const result = await compileProject(project(files), []);
  return result.diagnostics.map((d) => `${d.code} ${d.file} ${d.path} ${d.message}`);
}

describe('components', () => {
  it('pass the engine’s kinds with their fields set or left out', async () => {
    const objects = [
      { id: 'lamp', shape: 'box', components: { light: { color: '#ffcc88', intensity: 2, range: 6 } } },
      { id: 'wall', shape: 'box', components: { collider: {}, spawn: { start: true } } },
      { id: 'gate', shape: 'box', components: { trigger: { effects: [], once: true } } },
    ];
    expect(await problems(yard(objects))).toEqual([]);
  });

  it('are E062 for a kind there isn’t and E063 for fields that don’t fit, at the field', async () => {
    const objects = [
      { id: 'a', shape: 'box', components: { glow: {} } },
      { id: 'b', shape: 'box', components: { light: { intensity: 500, radius: 2 } } },
      { id: 'c', shape: 'box', components: { trigger: { once: true } } },
      { id: 'd', shape: 'box', components: { sound: { of: 'sound:hum' } } },
    ];
    expect(await problems(yard(objects))).toEqual([
      'E062 spaces/yard.json /objects/0/components/glow No component kind "glow": the engine has none, nor has components/',
      'E063 spaces/yard.json /objects/1/components/light/intensity At most 100',
      'E063 spaces/yard.json /objects/1/components/light/radius Unknown field "radius"',
      'E063 spaces/yard.json /objects/2/components/trigger/effects Missing field "effects"',
      'E005 spaces/yard.json /objects/3/components/sound/of No record sound:hum',
    ]);
  });

  it('take a project’s own kinds from components/, and wait unchecked while a kind’s file has problems', async () => {
    const hold = { title: 'Hold', fields: { grade: { kind: 'enum', values: ['easy', 'hard'] } } };
    const objects = [
      { id: 'a', shape: 'box', components: { hold: { grade: 'hard' } } },
      { id: 'b', shape: 'box', components: { hold: { grade: 'mid' } } },
      { id: 'c', shape: 'box', components: { broken: { anything: 1 } } },
    ];
    const found = await problems({
      ...yard(objects),
      'components/hold.json': hold,
      'components/broken.json': { title: 'Broken', fields: { x: { kind: 'shiny' } } },
      'components/light.json': hold,
      'components/old/hold.json': hold,
    });
    expect(found.map((line) => line.split(' ').slice(0, 3).join(' '))).toEqual([
      'E015 components/broken.json /fields/x/kind',
      'E017 components/light.json ',
      'E017 components/old/hold.json ',
      'E063 spaces/yard.json /objects/1/components/hold/grade',
    ]);
  });
});

describe('placed records', () => {
  it('pass a record that is there, its overrides fitting its type', async () => {
    const objects = [{ id: 'tom', record: 'keeper:tom', overrides: { name: 'Old Tom', greeting: 'Hail' } }];
    expect(await problems(yard(objects))).toEqual([]);
  });

  it('are E064 for a type or a record there isn’t, and E065 for an override that doesn’t fit', async () => {
    const objects = [
      { id: 'a', record: 'ghost:tom' },
      { id: 'b', record: 'keeper:ann' },
      { id: 'c', record: 'keeper:tom', overrides: { name: 7, hat: 'red', friend: 'nobody' } },
    ];
    expect(await problems(yard(objects))).toEqual([
      'E064 spaces/yard.json /objects/0/record No record type "ghost" in this project',
      'E064 spaces/yard.json /objects/1/record No record keeper:ann',
      'E005 spaces/yard.json /objects/2/overrides/friend No record keeper:nobody',
      'E065 spaces/yard.json /objects/2/overrides/hat Unknown field "hat"',
      'E065 spaces/yard.json /objects/2/overrides/name Expected text',
    ]);
  });

  it('report only the fields they override: the record’s own problems are the record’s', async () => {
    const files = {
      ...yard([{ id: 'c', record: 'keeper:ann', overrides: { greeting: 'Hi' } }]),
      'records/keeper/ann.json': { name: 'Ann', friend: 'nobody' },
    };
    expect(await problems(files)).toEqual(['E005 records/keeper/ann.json /friend No record keeper:nobody']);
  });
});

describe('prefab overrides', () => {
  it('pass fields an object can change, deeper ones by nesting', async () => {
    const objects = [
      { id: 'lamp', prefab: 'lamp', overrides: { bulb: { color: '#ffcc66', components: { light: { range: 12 } } } } },
      {
        id: 'house',
        prefab: 'house',
        overrides: {
          door: { at: [1, 0, 0], overrides: { knob: { color: '#ffffff' } } },
          host: { overrides: { greeting: 'Come in' } },
        },
      },
    ];
    expect(await problems(yard(objects))).toEqual([]);
  });

  it('are E066 for an object the prefab hasn’t, and E058 for a field it can’t change', async () => {
    const objects = [
      { id: 'lamp', prefab: 'lamp', overrides: { shade: { color: '#ffffff' }, bulb: { id: 'x', at: [1, 2] } } },
      {
        id: 'house',
        prefab: 'house',
        overrides: {
          door: { shape: 'box', overrides: { handle: {} } },
          walls: { overrides: {} },
          host: { color: '#ffffff' },
        },
      },
    ];
    expect(await problems(yard(objects))).toEqual([
      'E058 spaces/yard.json /objects/0/overrides/bulb/at Too small: expected array to have >=3 items',
      'E058 spaces/yard.json /objects/0/overrides/bulb/id Unknown field "id"',
      'E066 spaces/yard.json /objects/0/overrides/shade The prefab "lamp" has no object "shade"',
      'E058 spaces/yard.json /objects/1/overrides/door/shape Only a shape can change its shape',
      'E058 spaces/yard.json /objects/1/overrides/host/color Only a shape has a colour of its own',
      'E058 spaces/yard.json /objects/1/overrides/walls/overrides A shape places nothing to override',
    ]);
  });

  it('check what the merge makes: a component short of a field, or a field that doesn’t fit, at the override', async () => {
    const objects = [
      {
        id: 'lamp',
        prefab: 'lamp',
        overrides: { bulb: { components: { light: { range: -1 }, trigger: { once: true } } } },
      },
      {
        id: 'house',
        prefab: 'house',
        overrides: { door: { overrides: { nob: {} } }, host: { overrides: { name: 3 } } },
      },
    ];
    expect(await problems(yard(objects))).toEqual([
      'E063 spaces/yard.json /objects/0/overrides/bulb/components/light/range At least 0.1',
      'E063 spaces/yard.json /objects/0/overrides/bulb/components/trigger/effects Missing field "effects"',
      'E066 spaces/yard.json /objects/1/overrides/door/overrides/nob The prefab "door" has no object "nob"',
      'E065 spaces/yard.json /objects/1/overrides/host/overrides/name Expected text',
    ]);
  });
});

describe('a space’s start', () => {
  it('is W142 at each object past the first whose spawn is the start, prefabs’ own included', async () => {
    const start = { spawn: { start: true } };
    const found = await problems({
      'prefabs/porch.json': { name: 'Porch', objects: [{ id: 'step', shape: 'box', components: start }] },
      ...yard([
        { id: 'a', shape: 'box', components: start },
        { id: 'b', shape: 'box', components: { spawn: {} } },
        { id: 'c', prefab: 'porch' },
      ]),
    });
    expect(found).toEqual([
      "W142 spaces/yard.json /objects/2 2 spawns are this space's start: a space is entered at one",
    ]);
    // In a prefab it is no space's start yet.
    expect(
      await problems({
        'prefabs/porch.json': {
          name: 'P',
          objects: [
            { id: 'a', shape: 'box', components: start },
            { id: 'b', shape: 'box', components: start },
          ],
        },
      }),
    ).toEqual([]);
  });
});
