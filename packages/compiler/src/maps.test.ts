/**
 * Spaces' maps in the compiler (M6.6, D78, docs/specs/markers.md#the-map): what a bake draws and the
 * hash a map file carries, the file read, E087 and W154, and a project with a map packed as format 14.
 */
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile.ts';
import { mapInputsHash } from './mapInputs.ts';
import { memorySource } from './source.ts';
import { classifySpaceFile } from './spaceFiles.ts';
import type { SpaceJson } from './spaceShape.ts';

const shed: SpaceJson = { name: 'Shed', objects: [{ id: 'bench', shape: 'box', at: [0, 0, 1] }] };
const yard: SpaceJson = { name: 'Yard', objects: [{ id: 'wall', shape: 'box' }] };
const glen: SpaceJson = {
  name: 'Glen',
  environment: 'dusk',
  objects: [
    { id: 'cairn', shape: 'cylinder', at: [2, 0, 3] },
    { id: 'shed', prefab: 'shed', at: [8, 0, 0] },
    { id: 'rope', record: 'item:rope', at: [1, 0, 1] },
  ],
};
const records: Record<string, unknown> = {
  'item:rope': { name: 'Rope' },
  'environment:dusk': { hour: 19 },
};
const sources = (more: Record<string, unknown> = {}) => ({
  record: (key: string) => ({ ...records, ...more })[key],
  types: new Map(),
});
const hash = (
  space: SpaceJson,
  prefabs = new Map([
    ['shed', shed],
    ['yard', yard],
  ]),
  more: Record<string, unknown> = {},
  terrain = {},
) => mapInputsHash('glen', space, prefabs, sources(more), terrain);

describe('mapInputsHash', () => {
  const now = hash(glen);

  it('changes when an object moves, a prefab it places changes, a record it draws or its terrain', () => {
    expect(now).toMatch(/^[0-9a-f]{16}$/);
    expect(hash(glen)).toBe(now);
    const moved = { ...glen, objects: glen.objects.map((o) => (o.id === 'cairn' ? { ...o, at: [2, 0, 4] } : o)) };
    expect(hash(moved as SpaceJson)).not.toBe(now);
    const wider = { ...shed, objects: [{ id: 'bench', shape: 'box', at: [0, 0, 2] }] } as SpaceJson;
    expect(hash(glen, new Map([['shed', wider]]))).not.toBe(now);
    expect(hash(glen, undefined, { 'item:rope': { name: 'Long rope' } })).not.toBe(now);
    expect(hash(glen, undefined, {}, { heights: new Uint8Array([1]) })).not.toBe(
      hash(glen, undefined, {}, { heights: new Uint8Array([2]) }),
    );
  });

  it('stays when what isn’t drawn changes: a prefab it doesn’t place, its environment', () => {
    expect(hash(glen, new Map([['shed', shed]]))).toBe(now);
    expect(hash(glen, undefined, { 'environment:dusk': { hour: 7 } })).toBe(now);
  });
});

describe('a map file', () => {
  it('is spaces/<id>.map.json, its space’s id carried as a navmesh carries it', () => {
    expect(classifySpaceFile('spaces/glen.map.json')).toEqual({ kind: 'map', id: 'glen' });
    expect(classifySpaceFile('spaces/Glen.map.json')).toMatchObject({ kind: 'misplaced' });
    expect(classifySpaceFile('spaces/glen.map.webp')).toEqual({ kind: 'ignored' });
  });
});

describe('a project with a map', () => {
  const space: SpaceJson = { name: 'Glen', objects: [{ id: 'cairn', shape: 'cylinder', at: [2, 0, 3] }] };
  const fresh = mapInputsHash('glen', space, new Map(), { record: () => undefined, types: new Map() }, {});
  const map = { bounds: [-10, -10, 10, 10], size: [1024, 1024], image: 'glen.map.webp', hash: fresh };
  const files = (given: unknown = map, more: Record<string, string | Uint8Array> = {}) => ({
    'project.json': JSON.stringify({ format: 1, id: 'glen', name: 'Glen', version: '0.1.0' }),
    'spaces/glen.json': JSON.stringify(space),
    'spaces/glen.map.json': typeof given === 'string' ? given : JSON.stringify(given),
    'spaces/glen.map.webp': new Uint8Array([82, 73, 70, 70]),
    ...more,
  });
  const problems = async (project: Record<string, string | Uint8Array>) =>
    (await compileProject(memorySource(project), [])).diagnostics.map((d) => `${d.code} ${d.file}: ${d.message}`);

  it('compiles clean while its map is fresh, as format 14 with the map and its image', async () => {
    const compiled = await compileProject(memorySource(files()), []);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.pack?.format).toBe(14);
    expect(compiled.pack?.world?.maps).toEqual({
      glen: { bounds: [-10, -10, 10, 10], size: [1024, 1024], image: 'spaces/glen.map.webp' },
    });
    expect(compiled.pack?.world?.files['spaces/glen.map.webp']).toBe('UklGRg==');
  });

  it('warns once its cairn has moved since: W154, and still packs it', async () => {
    const stale = files();
    stale['spaces/glen.json'] = JSON.stringify({ ...space, objects: [{ ...space.objects[0], at: [2, 0, 4] }] });
    const compiled = await compileProject(memorySource(stale), []);
    expect(compiled.diagnostics.map((d) => [d.code, d.file])).toEqual([['W154', 'spaces/glen.map.json']]);
    expect(compiled.pack?.format).toBe(14);
  });

  it('is E087 when it can’t be read, its image isn’t there, or its space isn’t', async () => {
    const at = 'E087 spaces/glen.map.json';
    expect(await problems(files('{'))).toEqual([expect.stringMatching(new RegExp(`^${at}: Not valid JSON`))]);
    expect(await problems(files({ ...map, bounds: [10, -10, -10, 10] }))).toEqual([
      `${at}: Not a map: bounds: Bounds are [least x, least z, most x, most z]: open its space and press Bake map`,
    ]);
    expect(await problems(files({ ...map, image: 'yard.map.webp' }))).toEqual([
      `${at}: Its image is glen.map.webp or glen.map.png, not "yard.map.webp": open its space and press Bake map`,
    ]);
    expect(await problems(files({ ...map, image: 'glen.map.png' }))).toEqual([
      `${at}: Its image, spaces/glen.map.png, isn't there: open its space and press Bake map`,
    ]);
    const orphan = files(map, { 'spaces/barn.map.json': JSON.stringify({ ...map, image: 'barn.map.webp' }) });
    expect(await problems(orphan)).toEqual([
      'E087 spaces/barn.map.json: No space "barn" for this map: spaces/barn.json isn\'t there',
    ]);
  });
});
