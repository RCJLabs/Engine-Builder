/**
 * Environments (M5.4, D66, docs/specs/environments.md#checks): the engine's environment records,
 * a space's environment, E068 for a fog that starts where it is whole, E069 for a space naming an
 * environment there isn't, E058 for a prefab naming one, and the record type's own E001s.
 */
import { DIAGNOSTIC_CODES, ENVIRONMENT_DEFAULTS, ENVIRONMENT_TYPE_FILE } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile.ts';
import { memorySource } from './source.ts';
import { checkSpaceParts } from './spaceParts.ts';
import { readSpaces } from './spaces.ts';

const json = (value: unknown) => JSON.stringify(value);

const DUSK = {
  name: 'Fell at dusk',
  hour: 19,
  sky: 'gradient',
  zenith: '#22355a',
  horizon: '#e0905a',
  ground: '#3a3028',
  fog: { color: '#8a7f86', near: 40, far: 300 },
  weather: 'rain',
  'weather-amount': 0.3,
};

function project(files: Record<string, unknown>) {
  return memorySource({
    'project.json': '{ "format": 1, "id": "fell", "name": "Fell", "version": "0.1.0" }',
    'records/environment/dusk.json': json(DUSK),
    'records/music/gloom.json': '{ "stems": [] }',
    ...Object.fromEntries(Object.entries(files).map(([path, value]) => [path, json(value)])),
  });
}

async function problems(files: Record<string, unknown>): Promise<string[]> {
  const result = await compileProject(project(files), []);
  return result.diagnostics.map((d) => `${d.code} ${d.file} ${d.path} ${d.message}`);
}

describe('environment records', () => {
  it('pass with every field set, or none', async () => {
    expect(await problems({ 'records/environment/plain.json': {} })).toEqual([]);
  });

  it('give each field left out a value, and leave out only the name and the fog', () => {
    const given = Object.keys(ENVIRONMENT_DEFAULTS).sort();
    const fields = Object.keys(ENVIRONMENT_TYPE_FILE.fields).filter((f) => f !== 'name' && f !== 'fog');
    expect(given).toEqual(fields.sort());
    for (const def of Object.values(ENVIRONMENT_TYPE_FILE.fields)) expect(def.optional).toBe(true);
  });

  it('are E068 at the fog’s near when it is not below its far', async () => {
    const fog = (near: number, far: number) => ({ fog: { color: '#808080', near, far } });
    expect(
      await problems({
        'records/environment/even.json': fog(50, 50),
        'records/environment/back.json': fog(80, 20),
        'records/environment/just.json': fog(49.9, 50),
      }),
    ).toEqual([
      'E068 records/environment/back.json /fog/near The fog starts at 80 m, not nearer than where it is whole, 20 m',
      'E068 records/environment/even.json /fog/near The fog starts at 50 m, not nearer than where it is whole, 50 m',
    ]);
  });

  it('are E001 out of their bounds, of an unknown sky or weather, or of a colour that isn’t one', async () => {
    const found = await problems({
      'records/environment/odd.json': { hour: 25, sky: 'starry', weather: 'hail', zenith: 'blue', fog: { near: 1 } },
    });
    expect(found.map((line) => line.split(' ').slice(0, 3).join(' '))).toEqual([
      'E001 records/environment/odd.json /fog/color',
      'E001 records/environment/odd.json /fog/far',
      'E001 records/environment/odd.json /hour',
      'E001 records/environment/odd.json /sky',
      'E001 records/environment/odd.json /weather',
      'E001 records/environment/odd.json /zenith',
    ]);
  });

  it('are the engine’s, so a project’s types/ can’t define one', async () => {
    const found = await problems({ 'types/environment.json': { title: 'Mine', fields: {} } });
    expect(found.some((line) => line.startsWith('E') && line.includes('types/environment.json'))).toBe(true);
  });
});

describe('a space’s environment', () => {
  it('names an environment record', async () => {
    expect(await problems({ 'spaces/fell.json': { name: 'Fell', environment: 'dusk', objects: [] } })).toEqual([]);
  });

  it('is E069 when the record isn’t there, even with a record of that id of another type', async () => {
    expect(
      await problems({
        'spaces/fell.json': { name: 'Fell', environment: 'dawn', objects: [] },
        'spaces/cave.json': { name: 'Cave', environment: 'gloom', objects: [] },
      }),
    ).toEqual([
      'E069 spaces/cave.json /environment No environment record "gloom"',
      'E069 spaces/fell.json /environment No environment record "dawn"',
    ]);
    expect(DIAGNOSTIC_CODES.E069).toContain('environment');
  });

  it('is E058 when it isn’t an id, and in a prefab at all', async () => {
    expect(
      await problems({
        'spaces/fell.json': { name: 'Fell', environment: 'Dusk!', objects: [] },
        'prefabs/hut.json': { name: 'Hut', environment: 'dusk', objects: [] },
      }),
    ).toEqual([
      'E058 prefabs/hut.json /environment Only a space has an environment: a prefab takes its space’s',
      'E058 spaces/fell.json /environment Not an id: use lowercase words joined by hyphens',
    ]);
  });

  it('is a use of the record, at the space’s environment, for "used by"', async () => {
    const source = project({ 'spaces/fell.json': { name: 'Fell', environment: 'dusk', objects: [] } });
    const read = await readSpaces(source);
    const has = (type: string, id: string) => type === 'environment' && id === 'dusk';
    const found = checkSpaceParts(read.files, {
      types: new Map(),
      records: { has, ids: () => [] } as never,
      value: () => undefined,
      known: {} as never,
      kinds: new Map(),
      uncheckedKinds: new Set(),
    });
    expect(found).toEqual({
      diagnostics: [],
      uses: [{ key: 'environment:dusk', file: 'spaces/fell.json', object: '', path: '/environment' }],
    });
  });
});
